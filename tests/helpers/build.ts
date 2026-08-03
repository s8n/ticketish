// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Builders for synthetic tickets.
 *
 * Tests must never contain real ticket data (see AGENTS.md), so everything a
 * parser needs is constructed here instead: bit-packed bodies, TLV envelopes,
 * and where a format wraps its payload in a signature, a throwaway RSA key
 * generated per test run signs it.
 */
import { generateKeyPairSync } from 'node:crypto';
import { zlibSync, strToU8 } from 'fflate';
import { hex } from '../../src/lib/tickets/bytes.ts';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------- RSA -----

export interface TestKey {
	n: bigint;
	e: bigint;
	d: bigint;
	/** Modulus length in bytes. */
	length: number;
	modulusHex: string;
	exponentHex: string;
}

const b64uToBigInt = (value: string) => BigInt('0x' + Buffer.from(value, 'base64url').toString('hex'));

/** A throwaway RSA key. Never used for anything but signing test fixtures. */
export function testKey(modulusLength = 1024): TestKey {
	for (;;) {
		const { privateKey } = generateKeyPairSync('rsa', { modulusLength });
		const jwk = privateKey.export({ format: 'jwk' }) as Record<string, string>;
		const n = b64uToBigInt(jwk.n);
		const length = modulusLength / 8;
		const modulusHex = n.toString(16).padStart(length * 2, '0');
		// our parsers derive the modulus length from the hex string
		if (modulusHex.length !== length * 2) continue;
		return {
			n,
			e: b64uToBigInt(jwk.e),
			d: b64uToBigInt(jwk.d),
			length,
			modulusHex,
			// exactly four bytes, which is what the certificate walker expects
			exponentHex: b64uToBigInt(jwk.e).toString(16).padStart(8, '0')
		};
	}
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
	let result = 1n;
	base %= mod;
	while (exp > 0n) {
		if (exp & 1n) result = (result * base) % mod;
		base = (base * base) % mod;
		exp >>= 1n;
	}
	return result;
}

const toBigInt = (b: Uint8Array) => {
	let n = 0n;
	for (const x of b) n = (n << 8n) | BigInt(x);
	return n;
};

const toBytes = (n: bigint, length: number) => {
	const out = new Uint8Array(length);
	for (let i = length - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
};

const sha1 = (d: Uint8Array) => new Uint8Array(createHash('sha1').update(d).digest());
const sha256 = (d: Uint8Array) => new Uint8Array(createHash('sha256').update(d).digest());

/**
 * ISO 9796-2 scheme 2 signature with message recovery, as VDV uses:
 * 0x6A || recoverable part || SHA-1(whole message) || 0xBC.
 */
export function signIso9796(message: Uint8Array, key: TestKey) {
	const recoverableLength = key.length - 22;
	const recoverable = message.subarray(0, recoverableLength);
	const remainder = message.subarray(recoverableLength);
	const block = new Uint8Array(key.length);
	block[0] = 0x6a;
	block.set(recoverable, 1);
	block.set(sha1(message), 1 + recoverable.length);
	block[block.length - 1] = 0xbc;
	return {
		signature: toBytes(modPow(toBigInt(block), key.d, key.n), key.length),
		remainder: new Uint8Array(remainder)
	};
}

// --------------------------------------------------------- UIC 918.3 -----

/** Frame a record: 6 char id, 2 digit version, 4 digit total length. */
export function uicRecord(id: string, version: number, body: string): string {
	return `${id}${String(version).padStart(2, '0')}${String(body.length + 12).padStart(4, '0')}${body}`;
}

export function uicEnvelope(
	issuerRics: number,
	records: string,
	{ version = 1, flags = '0' }: { version?: 1 | 2; flags?: string } = {}
): Uint8Array {
	void flags;
	const compressed = zlibSync(strToU8(records));
	const signatureLength = version === 1 ? 50 : 64;
	const header = strToU8(
		`#UT${String(version).padStart(2, '0')}${String(issuerRics).padStart(4, '0')}00001` +
			'\0'.repeat(signatureLength) +
			String(compressed.length).padStart(4, '0')
	);
	const out = new Uint8Array(header.length + compressed.length);
	out.set(header);
	out.set(compressed, header.length);
	return out;
}

/** U_HEAD body: 41 bytes of fixed width fields. */
export function uicHead({
	rics = 1080,
	ticketId = 'TESTTICKET0001',
	issued = '01012024' + '1200',
	flags = '0',
	language = 'de',
	secondLanguage = '  '
}: {
	rics?: number;
	ticketId?: string;
	issued?: string;
	flags?: string;
	language?: string;
	secondLanguage?: string;
} = {}): string {
	return (
		String(rics).padStart(4, '0') +
		ticketId.padEnd(20, ' ') +
		issued.padEnd(12, '0') +
		flags +
		language +
		secondLanguage
	);
}

/** U_TLAY body: RCT2 layout with fixed width field descriptors. */
export function uicLayout(fields: { line: number; column: number; text: string }[]): string {
	const p = (n: number) => String(n).padStart(2, '0');
	const body = fields
		.map(
			(f) =>
				p(f.line) +
				p(f.column) +
				p(1) +
				p(f.text.length) +
				'0' +
				String(f.text.length).padStart(4, '0') +
				f.text
		)
		.join('');
	return 'RCT2' + String(fields.length).padStart(4, '0') + body;
}

// --------------------------------------------------------------- bits -----

/** Writes big-endian bit fields, mirroring how the formats pack them. */
export class BitWriter {
	private bits: number[] = [];

	int(value: number, width: number): this {
		for (let i = width - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
		return this;
	}

	bool(value: boolean): this {
		return this.int(value ? 1 : 0, 1);
	}

	/** 6 bit characters offset by 0x20, padded with spaces. */
	str6(text: string, chars: number): this {
		const padded = text.padEnd(chars, ' ');
		for (let i = 0; i < chars; i++) this.int(padded.charCodeAt(i) - 0x20, 6);
		return this;
	}

	/** 6 bit alphanumeric alphabet: digits, then A-Z, 36 is a space. */
	strAlpha(text: string, chars: number): this {
		const padded = text.padEnd(chars, ' ');
		for (let i = 0; i < chars; i++) {
			const c = padded[i];
			let value = 36;
			if (c >= '0' && c <= '9') value = c.charCodeAt(0) - 48;
			else if (c >= 'A' && c <= 'Z') value = c.charCodeAt(0) - 65 + 10;
			this.int(value, 6);
		}
		return this;
	}

	padTo(bitLength: number): this {
		while (this.bits.length < bitLength) this.bits.push(0);
		return this;
	}

	get length(): number {
		return this.bits.length;
	}

	bytes(totalBytes?: number): Uint8Array {
		const out = new Uint8Array(totalBytes ?? Math.ceil(this.bits.length / 8));
		this.bits.forEach((bit, i) => {
			if (bit) out[i >> 3] |= 0x80 >> (i & 7);
		});
		return out;
	}
}

// ----------------------------------------------------------------- TLV ----

export function tlv(tag: number, value: Uint8Array): Uint8Array {
	const tagBytes = tag > 0xff ? [tag >> 8, tag & 0xff] : [tag];
	let lengthBytes: number[];
	if (value.length < 0x80) lengthBytes = [value.length];
	else if (value.length < 0x100) lengthBytes = [0x81, value.length];
	else lengthBytes = [0x82, value.length >> 8, value.length & 0xff];
	const out = new Uint8Array(tagBytes.length + lengthBytes.length + value.length);
	out.set(tagBytes);
	out.set(lengthBytes, tagBytes.length);
	out.set(value, tagBytes.length + lengthBytes.length);
	return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((a, p) => a + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

export { hex, sha256 };
