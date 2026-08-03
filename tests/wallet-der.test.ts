// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The DER encoder and the certificate reader. Both are small enough to check
 * against known encodings rather than against themselves, which is the point:
 * everything above them assumes these bytes are right.
 */
import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import {
	children,
	derTime,
	integer,
	oid,
	oidString,
	readNode,
	sequence,
	setOf,
	TAG,
	tlv,
	utcTime
} from '../src/lib/wallet/der.ts';
import { base64ToBytes, readCertificate } from '../src/lib/wallet/identity.ts';
import { WWDR_G4_BASE64 } from '../src/lib/wallet/wwdr.ts';
import { hex } from '../src/lib/tickets/bytes.ts';

describe('DER encoding', () => {
	it('encodes an object identifier the way the standard does', () => {
		// 1.2.840.113549.1.7.2 (signedData) is the worked example everywhere
		expect(hex(oid('1.2.840.113549.1.7.2'))).toBe('06092a864886f70d010702');
		// the first two arcs share a byte: 2*40 + 5 = 85 = 0x55
		expect(hex(oid('2.5.4.3'))).toBe('0603550403');
		// a UID's first arc is 0, so the second arc stands alone
		expect(hex(oid('0.9.2342.19200300.100.1.1'))).toBe('060a0992268993f22c640101');
	});

	it('refuses something that is not an identifier', () => {
		expect(() => oid('1')).toThrow();
		expect(() => oid('1.x')).toThrow();
	});

	it('writes integers in the fewest bytes, padding away a sign bit', () => {
		expect(hex(integer(0))).toBe('020100');
		expect(hex(integer(127))).toBe('02017f');
		// 128 would read as negative without the leading zero
		expect(hex(integer(128))).toBe('02020080');
		expect(hex(integer(0x1234))).toBe('02021234');
	});

	it('uses long form lengths past 127 bytes', () => {
		const long = tlv(TAG.octetString, new Uint8Array(200));
		expect(long[0]).toBe(TAG.octetString);
		expect(long[1]).toBe(0x81);
		expect(long[2]).toBe(200);
		expect(long.length).toBe(203);
	});

	it('sorts a SET OF by its members encodings', () => {
		// a verifier re-encodes signed attributes to check them, so the order
		// is part of what was signed rather than a matter of taste
		const a = tlv(TAG.octetString, new Uint8Array([0x01]));
		const b = tlv(TAG.octetString, new Uint8Array([0x02]));
		expect(hex(setOf(b, a))).toBe(hex(setOf(a, b)));
		expect(hex(setOf(b, a))).toBe('3106040101040102');
	});

	it('writes a UTCTime in UTC with seconds', () => {
		const time = utcTime(new Date('2026-08-03T09:05:07Z'));
		expect(new TextDecoder().decode(time.subarray(2))).toBe('260803090507Z');
		expect(derTime(readNode(time))?.toISOString()).toBe('2026-08-03T09:05:07.000Z');
	});
});

describe('DER reading', () => {
	it('walks a sequence into its children', () => {
		const encoded = sequence(integer(1), oid('2.5.4.3'), integer(300));
		const parts = children(readNode(encoded));
		expect(parts.map((p) => p.tag)).toEqual([TAG.integer, TAG.oid, TAG.integer]);
		expect(oidString(parts[1])).toBe('2.5.4.3');
	});

	it('rejects an indefinite length, which DER does not have', () => {
		expect(() => readNode(new Uint8Array([0x30, 0x80, 0x00, 0x00]))).toThrow(/indefinite/);
	});

	it('rejects a length that runs past the buffer', () => {
		expect(() => readNode(new Uint8Array([0x04, 0x08, 0x00]))).toThrow(/past the end/);
	});
});

describe('the bundled Apple intermediate', () => {
	const der = base64ToBytes(WWDR_G4_BASE64);

	it('is the WWDR G4 certificate and nothing else', () => {
		const parsed = new X509Certificate(Buffer.from(der));
		expect(parsed.subject).toContain('Apple Worldwide Developer Relations');
		expect(parsed.subject).toContain('OU=G4');
		expect(parsed.issuer).toContain('Apple Root CA');
	});

	it('reads the same way through our own reader', () => {
		const ours = readCertificate(der);
		const theirs = new X509Certificate(Buffer.from(der));
		expect(ours.notAfter?.toISOString()).toBe(new Date(theirs.validTo).toISOString());
		expect(ours.commonName).toContain('Apple Worldwide Developer Relations');
		// an intermediate is not a pass certificate: no UID, no team
		expect(ours.passTypeIdentifier).toBeUndefined();
		expect(ours.teamIdentifier).toBe('G4');
	});

	it('has not expired, which a build has to stay ahead of', () => {
		expect(readCertificate(der).notAfter!.getTime()).toBeGreaterThan(Date.now());
	});
});
