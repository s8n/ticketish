// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Just enough DER to write a PKCS#7 signature and read an X.509 certificate.
 *
 * The app already has an ASN.1 decoder, but it speaks UPER and only decodes,
 * which is the wrong half of the wrong encoding for this. Signing a pass needs
 * DER, and needs to *produce* it. This is the small subset that takes: the
 * handful of universal types a CMS structure is built from, plus a reader that
 * walks a certificate far enough to find the issuer, the serial number and the
 * subject's attributes.
 *
 * Nothing here validates a certificate. The wallet signature only needs the
 * certificate copied into it verbatim and two of its fields quoted back; Apple
 * decides whether it is any good, and it has the root to do that with.
 */

// ------------------------------------------------------------ writing ---

/** A definite-length header for `tag` over `length` content bytes. */
function header(tag: number, length: number): Uint8Array {
	if (length < 0x80) return new Uint8Array([tag, length]);
	const bytes: number[] = [];
	for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
	return new Uint8Array([tag, 0x80 | bytes.length, ...bytes]);
}

/** A complete TLV: header for `tag`, then `content`. */
export function tlv(tag: number, content: Uint8Array): Uint8Array {
	const head = header(tag, content.length);
	const out = new Uint8Array(head.length + content.length);
	out.set(head);
	out.set(content, head.length);
	return out;
}

export function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

export const TAG = {
	boolean: 0x01,
	integer: 0x02,
	bitString: 0x03,
	octetString: 0x04,
	null: 0x05,
	oid: 0x06,
	utf8String: 0x0c,
	printableString: 0x13,
	ia5String: 0x16,
	utcTime: 0x17,
	generalizedTime: 0x18,
	sequence: 0x30,
	set: 0x31
} as const;

export const sequence = (...parts: Uint8Array[]) => tlv(TAG.sequence, concat(parts));

/**
 * A DER SET OF, which is sorted by the encoding of its members. The sort is
 * not decoration: a verifier re-encodes the signed attributes to check the
 * signature, and would get different bytes from a different order.
 */
export function setOf(...parts: Uint8Array[]): Uint8Array {
	const sorted = [...parts].sort(compareEncodings);
	return tlv(TAG.set, concat(sorted));
}

function compareEncodings(a: Uint8Array, b: Uint8Array): number {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return a.length - b.length;
}

export const octetString = (content: Uint8Array) => tlv(TAG.octetString, content);
export const nullValue = () => new Uint8Array([TAG.null, 0x00]);

/** An [n] EXPLICIT wrapper, which is a constructed context-specific tag. */
export const explicit = (n: number, content: Uint8Array) => tlv(0xa0 | n, content);

/** An [n] IMPLICIT constructed tag, replacing a SEQUENCE OF or SET OF tag. */
export const implicitConstructed = (n: number, content: Uint8Array) => tlv(0xa0 | n, content);

/** A non-negative integer, in the minimum number of bytes DER allows. */
export function integer(value: number | bigint): Uint8Array {
	let n = BigInt(value);
	if (n < 0n) throw new Error('negative integers are not needed here');
	const bytes: number[] = [];
	do {
		bytes.unshift(Number(n & 0xffn));
		n >>= 8n;
	} while (n > 0n);
	// a leading bit of 1 would read as negative, so pad it away
	if (bytes[0] & 0x80) bytes.unshift(0);
	return tlv(TAG.integer, new Uint8Array(bytes));
}

/** An integer whose content bytes are already known, as a certificate's is. */
export const integerBytes = (content: Uint8Array) => tlv(TAG.integer, content);

/** A dotted object identifier, e.g. "1.2.840.113549.1.7.2". */
export function oid(dotted: string): Uint8Array {
	const parts = dotted.split('.').map(Number);
	if (parts.length < 2 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
		throw new Error(`not an object identifier: ${dotted}`);
	}
	const bytes: number[] = [parts[0] * 40 + parts[1]];
	for (const part of parts.slice(2)) {
		const chunk: number[] = [part & 0x7f];
		for (let n = part >>> 7; n > 0; n >>>= 7) chunk.unshift((n & 0x7f) | 0x80);
		bytes.push(...chunk);
	}
	return tlv(TAG.oid, new Uint8Array(bytes));
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * A UTCTime, which is what a CMS signing-time attribute carries for any year
 * a pass will plausibly be signed in. Always UTC, always with seconds.
 */
export function utcTime(date: Date): Uint8Array {
	const year = date.getUTCFullYear();
	if (year < 1950 || year >= 2050) throw new Error('UTCTime cannot carry this year');
	const text =
		two(year % 100) +
		two(date.getUTCMonth() + 1) +
		two(date.getUTCDate()) +
		two(date.getUTCHours()) +
		two(date.getUTCMinutes()) +
		two(date.getUTCSeconds()) +
		'Z';
	return tlv(TAG.utcTime, new TextEncoder().encode(text));
}

// ------------------------------------------------------------ reading ---

export interface DerNode {
	tag: number;
	/** Offset of the first content byte in the buffer this was read from. */
	start: number;
	/** Offset one past the last content byte. */
	end: number;
	content: Uint8Array;
	/** The whole node including its header, which is what gets copied on. */
	encoded: Uint8Array;
}

/** Read one TLV starting at `offset`. Definite lengths only, as DER requires. */
export function readNode(data: Uint8Array, offset = 0): DerNode {
	if (offset + 2 > data.length) throw new Error('truncated DER');
	let tag = data[offset];
	let pos = offset + 1;
	if ((tag & 0x1f) === 0x1f) throw new Error('high tag numbers are not supported');
	let length = data[pos++];
	if (length & 0x80) {
		const count = length & 0x7f;
		if (count === 0) throw new Error('indefinite lengths are not DER');
		if (count > 4) throw new Error('unreasonable DER length');
		length = 0;
		for (let i = 0; i < count; i++) length = length * 256 + data[pos++];
	}
	const end = pos + length;
	if (end > data.length) throw new Error('DER length runs past the end');
	return {
		tag,
		start: pos,
		end,
		content: data.subarray(pos, end),
		encoded: data.subarray(offset, end)
	};
}

/** Every TLV directly inside a constructed node's content. */
export function children(node: DerNode): DerNode[] {
	const out: DerNode[] = [];
	let offset = 0;
	while (offset < node.content.length) {
		const child = readNode(node.content, offset);
		out.push(child);
		offset = child.end;
	}
	return out;
}

/** An OID node's dotted form, for comparing against a known identifier. */
export function oidString(node: DerNode): string {
	const b = node.content;
	if (!b.length) return '';
	const parts = [Math.floor(b[0] / 40), b[0] % 40];
	let value = 0;
	for (let i = 1; i < b.length; i++) {
		value = value * 128 + (b[i] & 0x7f);
		if (!(b[i] & 0x80)) {
			parts.push(value);
			value = 0;
		}
	}
	return parts.join('.');
}

/** A string node's text. The certificate string types are all ASCII or UTF-8. */
export const derString = (node: DerNode) => new TextDecoder('utf-8').decode(node.content);

/**
 * A UTCTime or GeneralizedTime as a Date. UTCTime's two digit year follows
 * RFC 5280: 50 and above is 19xx, below is 20xx.
 */
export function derTime(node: DerNode): Date | null {
	const text = new TextDecoder('ascii').decode(node.content);
	const m = text.match(/^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
	if (!m) return null;
	let year = Number(m[1]);
	if (m[1].length === 2) year += year >= 50 ? 1900 : 2000;
	return new Date(
		Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
	);
}
