// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * BoB tickets, the Swedish national standard.
 *
 * Every payload is assembled by `buildBob` from invented values. No field of
 * any real ticket appears here, including the participant ids and product
 * names, which are made up to look like the real ones without being them.
 */
import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isBob, parseBob } from '../src/lib/tickets/bob/bob.ts';
import { decodeCbor } from '../src/lib/tickets/bob/cbor.ts';
import { buildBob, bobClaim, encodeCbor } from './helpers/bob.ts';

describe('CBOR', () => {
	it('round trips the types BoB uses', () => {
		const value = {
			n: 1000000,
			s: 'Skåne',
			b: new Uint8Array([1, 2, 3]),
			list: ['a', 24, 255, 256, 65536],
			nested: { yes: true, no: false, nothing: null }
		};
		expect(decodeCbor(encodeCbor(value))).toEqual(value);
	});

	it('rejects the forms the format does not use', () => {
		// indefinite length array, a tag, and a float
		expect(() => decodeCbor(new Uint8Array([0x9f, 0x01, 0xff]))).toThrow();
		expect(() => decodeCbor(new Uint8Array([0xc0, 0x61, 0x61]))).toThrow();
		expect(() => decodeCbor(new Uint8Array([0xfa, 0, 0, 0, 0]))).toThrow();
	});

	it('rejects trailing bytes and truncated items', () => {
		expect(() => decodeCbor(new Uint8Array([0x01, 0x02]))).toThrow(/trailing/);
		expect(() => decodeCbor(new Uint8Array([0x43, 0x01]))).toThrow();
	});

	it('refuses a length that would allocate more than a barcode holds', () => {
		// an array claiming four billion entries, with nothing after it
		expect(() => decodeCbor(new Uint8Array([0x9a, 0xff, 0xff, 0xff, 0xff]))).toThrow(/range/);
	});
});

describe('BoB detection', () => {
	it('accepts a well formed ticket', () => {
		expect(isBob(buildBob())).toBe(true);
	});

	it('rejects the container uncompressed', () => {
		expect(isBob(buildBob({ raw: true }))).toBe(false);
	});

	it('rejects an unknown container version', () => {
		expect(isBob(buildBob({ containerVersion: 'b2' }))).toBe(false);
	});

	it('rejects zlib that is not a BoB container', () => {
		expect(isBob(zlibSync(encodeCbor({ hello: 'world' })))).toBe(false);
		expect(isBob(zlibSync(new Uint8Array(64)))).toBe(false);
	});

	it('rejects a container with only one signature layer', () => {
		const single = encodeCbor({
			v: new TextEncoder().encode('a1'),
			p: encodeCbor([encodeCbor({ alg: 'ES256' }), encodeCbor({ x: 1 }), new Uint8Array(64)])
		});
		expect(isBob(zlibSync(single))).toBe(false);
	});

	it('rejects short and empty payloads', () => {
		expect(isBob(new Uint8Array(0))).toBe(false);
		expect(isBob(new Uint8Array([0x78, 0x9c]))).toBe(false);
	});
});

describe('BoB parsing', () => {
	it('reads both signature layers', () => {
		const ticket = parseBob(buildBob());
		expect(ticket.containerVersion).toBe('a1');
		expect(ticket.issuer.algorithm).toBe('ES256');
		expect(ticket.issuer.issuerId).toBe('99');
		expect(ticket.issuer.expires).toBe('2030-04-01T00:00:00Z');
		expect(ticket.device.algorithm).toBe('HS256-128');
		expect(ticket.device.signedAt).toBe('2030-01-01T09:00:00Z');
		// sixteen bytes of HMAC against sixty-four of ECDSA
		expect(ticket.device.signature).toHaveLength(32);
		expect(ticket.issuer.signature).toHaveLength(128);
	});

	it('reads the ticket id, travellers and validity', () => {
		const [claim] = parseBob(
			buildBob({
				claims: [
					bobClaim({
						ticketId: 'ABC1234',
						passengers: [
							['adult', '2'],
							['child', '1']
						],
						condition: '99:@20300715T1030Z/20300716T1030Z & #day_pass'
					})
				]
			})
		).claims;
		expect(claim.participantId).toBe('99');
		expect(claim.ticketId).toBe('ABC1234');
		expect(claim.passengers).toEqual([
			{ category: 'adult', count: '2' },
			{ category: 'child', count: '1' }
		]);
		expect(claim.condition?.validFrom).toBe('2030-07-15T10:30Z');
		expect(claim.condition?.validUntil).toBe('2030-07-16T10:30Z');
		expect(claim.condition?.names).toEqual(['day_pass']);
		expect(claim.definitionVersions).toEqual({ c_vn: '1', c_vm: '1', c_vt: '1' });
	});

	it('keeps the travel condition whole whatever it reads out of it', () => {
		const raw = '99:@20300715T1030Z/20300716T1030Z & 99:zone:[1,5,7] & (#a | #b)';
		const [claim] = parseBob(buildBob({ claims: [bobClaim({ condition: raw })] })).claims;
		expect(claim.condition?.raw).toBe(raw);
		expect(claim.condition?.names).toEqual(['a', 'b']);
	});

	it('leaves the validity unset when a negation could invert it', () => {
		const [claim] = parseBob(
			buildBob({ claims: [bobClaim({ condition: '99:! @20300715T1030Z/20300716T1030Z' })] })
		).claims;
		expect(claim.condition?.validFrom).toBeNull();
		expect(claim.condition?.validUntil).toBeNull();
	});

	it('leaves a duration endpoint unset rather than reading it as a date', () => {
		const [claim] = parseBob(
			buildBob({ claims: [bobClaim({ condition: '99:@P7M/20300618T0000Z' })] })
		).claims;
		expect(claim.condition?.validFrom).toBeNull();
		expect(claim.condition?.validUntil).toBe('2030-06-18T00:00Z');
	});

	it('reads several tickets out of one barcode', () => {
		const ticket = parseBob(
			buildBob({ claims: [bobClaim({ ticketId: 'ONE1111' }), bobClaim({ ticketId: 'TWO2222' })] })
		);
		expect(ticket.claims.map((c) => c.ticketId)).toEqual(['ONE1111', 'TWO2222']);
	});

	it('carries unmapped claim keys through rather than dropping them', () => {
		const [claim] = parseBob(
			buildBob({ claims: [{ ...(bobClaim() as object), c_zz: 'unknown' }] })
		).claims;
		expect(claim.other).toEqual({ c_zz: 'unknown' });
	});

	it('survives a claim with no metadata at all', () => {
		const [claim] = parseBob(buildBob({ claims: [{ c_tc: '99:#anytime' }] })).claims;
		expect(claim.ticketId).toBeNull();
		expect(claim.passengers).toEqual([]);
		expect(claim.condition?.names).toEqual(['anytime']);
	});
});

describe('BoB dispatch', () => {
	it('is picked up by the top level parser', () => {
		const container = parsePayload(buildBob());
		expect(container.kind).toBe('bob');
		if (container.kind !== 'bob') throw new Error('unreachable');
		expect(container.ticket.claims[0].ticketId).toBe('TEST001');
	});

	it('does not swallow a payload that merely inflates', () => {
		expect(parsePayload(zlibSync(new TextEncoder().encode('not a ticket'))).kind).not.toBe('bob');
	});
});
