// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Builds a synthetic UK RSP6 barcode. The ticket data lives inside an RSA
 * signature with message recovery, so a throwaway key signs it and the test
 * hands the matching public key to the parser.
 */
import { BitWriter, modPow, sha256, testKey, type TestKey } from './build.ts';
import type { RspKeyStore } from '../../src/lib/tickets/rsp/rsp6.ts';

const toBigInt = (b: Uint8Array) => {
	let n = 0n;
	for (const x of b) n = (n << 8n) | BigInt(x);
	return n;
};

const toBytes = (n: bigint) => {
	let h = n.toString(16);
	if (h.length % 2) h = '0' + h;
	return new Uint8Array(Buffer.from(h, 'hex'));
};

/** PKCS#1 v1.5 style block: 00 01 FF.. 00 || body || SHA-256(body)[0..8]. */
function sign(body: Uint8Array, key: TestKey): bigint {
	const check = sha256(body).subarray(0, 8);
	const data = new Uint8Array(body.length + check.length);
	data.set(body);
	data.set(check, body.length);

	const block = new Uint8Array(key.length);
	block[0] = 0x00;
	block[1] = 0x01;
	const padLength = key.length - data.length - 3;
	if (padLength < 8) throw new Error('payload too large for this key');
	block.fill(0xff, 2, 2 + padLength);
	block[2 + padLength] = 0x00;
	block.set(data, 3 + padLength);
	return modPow(toBigInt(block), key.d, key.n);
}

/** Inverse of the reader's base26: least significant digit first, bytes reversed. */
function toBase26(signature: bigint): string | null {
	const be = toBytes(signature);
	const reversed = new Uint8Array(be).reverse();
	// the reader drops leading zeros when it converts back, so refuse a
	// signature whose last byte is zero rather than emit something lossy
	if (reversed[0] === 0) return null;
	let num = toBigInt(reversed);
	let out = '';
	while (num > 0n) {
		out += String.fromCharCode(65 + Number(num % 26n));
		num /= 26n;
	}
	return out;
}

export interface BuiltRsp6 {
	barcode: Uint8Array;
	keys: RspKeyStore;
	issuerId: string;
	ticketRef: string;
}

/** Assemble a barcode around an already bit-packed ticket body. */
export function buildRsp6(
	body: Uint8Array,
	{ issuerId = 'ZZ', ticketRef = 'TESTREF01', ticketType = '06' } = {}
): BuiltRsp6 {
	for (let attempt = 0; attempt < 20; attempt++) {
		const key = testKey();
		const base26 = toBase26(sign(body, key));
		if (!base26) continue;
		const text = `${ticketType}${ticketRef}00${issuerId}${base26}`;
		return {
			barcode: new Uint8Array([...text].map((c) => c.charCodeAt(0))),
			issuerId,
			ticketRef,
			keys: {
				[issuerId]: [
					{ issuer_id: issuerId, modulus_hex: key.modulusHex, public_exponent_hex: key.exponentHex }
				]
			}
		};
	}
	throw new Error('could not build an RSP6 barcode');
}

export interface Rsp6Fields {
	ticketReference: string;
	standardClass: boolean;
	lennonTicketType: string;
	fareLabel: string;
	originNlc: string;
	destinationNlc: string;
	sellingNlc: string;
	childTicket: boolean;
	couponType: number;
	discountCode: number;
	routeCode: number;
	/** Days since 1997-01-01. */
	startDay: number;
	startMinutes: number;
	specVersion: number;
}

/** Pack the 108 byte ticket record the parser reads. */
export function rsp6TicketBody(f: Rsp6Fields): Uint8Array {
	const w = new BitWriter();
	w.bool(false); // mandatory manual check
	w.bool(false); // multiple supplements
	w.bool(false); // on paper
	w.int(0, 2); // static/dynamic
	w.bool(false); // non revenue
	w.int(f.specVersion, 2);
	w.str6(f.ticketReference, 9); // bits 8..62
	w.str6('', 1); // checksum, bits 62..68
	w.int(0, 4); // barcode version
	w.bool(f.standardClass);
	w.str6(f.lennonTicketType, 3);
	w.str6(f.fareLabel, 3);
	w.str6(f.originNlc.padStart(4, '0'), 4);
	w.str6(f.destinationNlc.padStart(4, '0'), 4);
	w.str6(f.sellingNlc.padStart(4, '0'), 4);
	w.bool(f.childTicket);
	w.int(f.couponType, 2);
	w.int(f.discountCode, 10);
	w.int(f.routeCode, 17);
	w.int(f.startDay, 14);
	w.int(f.startMinutes, 11);
	w.int(0, 2); // depart time flag
	w.int(0, 17); // passenger id
	w.str6('', 12); // parent reference, bits 255..327
	w.int(0, 2); // gender
	w.str6('', 3); // restriction code, bits 329..347
	w.bool(false); // via london
	w.str6('', 4); // osi nlc, bits 348..372
	w.bool(false); // bidirectional
	w.int(0, 6); // carnet count
	w.int(0, 4); // limited duration
	w.bool(true); // sub utn
	w.bool(false); // has optional data, bit 384
	w.bool(false); // print free use
	w.int(0, 4); // reservation count
	return w.padTo(108 * 8).bytes(108);
}
