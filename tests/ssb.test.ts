// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * SSB: bit-packed UIC barcodes, here the NS Keycard record. The payloads are
 * built by the test.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { parseSsb, isSsb } from '../src/lib/tickets/ssb/ssb.ts';
import { BitWriter } from './helpers/build.ts';

/** Envelope: version, issuer, key id, ticket type, then the body. */
function ssb(issuerRics: number, ticketType: number, body: (w: BitWriter) => void): Uint8Array {
	const w = new BitWriter();
	w.int(3, 4).int(issuerRics, 14).int(1, 4).int(ticketType, 5);
	body(w);
	// 114 bytes total, the last 56 of which are the signature
	return w.padTo(58 * 8).bytes(114);
}

/** NS Keycard body, which starts right after the 27 bit envelope header. */
function keycard({
	adults = 1,
	children = 0,
	specimen = false,
	travelClass = 2,
	cardId = 'KEYCARD001',
	yearDigit = 4,
	issuingDay = 100,
	product = 1,
	version = 0,
	startOffset = 0,
	endOffset = 30,
	travelDays = 0,
	extra = '',
	station = 0
} = {}) {
	return (w: BitWriter) => {
		w.int(adults, 7);
		w.int(children, 7);
		w.bool(!specimen); // inverted on this record
		w.int(travelClass, 6);
		w.str6(cardId, 14); // bits 21..105, 6 bit chars offset by 0x20
		w.int(yearDigit, 4);
		w.int(issuingDay, 9);
		w.int(product, 7);
		w.int(version, 4);
		w.int(startOffset, 9);
		w.int(endOffset, 12);
		w.int(travelDays, 7);
		w.str6(extra, 35); // bits 157..367
		w.int(station, 17);
	};
}

const NS_RICS = 1184;
const REFERENCE = new Date('2024-06-01T00:00:00Z');

describe('SSB envelope', () => {
	it('recognises a bit-packed payload and rejects printable ASCII', () => {
		const payload = ssb(NS_RICS, 21, keycard());
		expect(isSsb(payload)).toBe(true);
		// a Renfe barcode is all printable ASCII whose first byte looks like a
		// version, which must not be mistaken for SSB
		expect(isSsb(new Uint8Array([...'7'.repeat(200)].map((c) => c.charCodeAt(0))))).toBe(false);
	});

	it('reads envelope fields', () => {
		const e = parseSsb(ssb(NS_RICS, 21, keycard()), REFERENCE);
		expect(e.version).toBe(3);
		expect(e.issuerRics).toBe(NS_RICS);
		expect(e.keyId).toBe(1);
		expect(e.ticketType).toBe(21);
		expect(e.ticketTypeName).toBe('NS Keycard');
	});

	it('reports ticket types it does not decode', () => {
		const e = parseSsb(ssb(NS_RICS, 17, keycard()), REFERENCE);
		expect(e.data).toBeNull();
		expect(e.unsupported).toMatch(/not decoded/);
		expect(e.bodyHex.length).toBeGreaterThan(0);
	});
});

describe('NS Keycard record', () => {
	it('decodes the card', () => {
		const e = parseSsb(
			ssb(NS_RICS, 21, keycard({ cardId: 'KEYCARD001', adults: 2, product: 4, station: 123 })),
			REFERENCE
		);
		const k = e.data;
		expect(k?.kind).toBe('ns-keycard');
		if (k?.kind !== 'ns-keycard') return;
		expect(k.cardId).toBe('KEYCARD001');
		expect(k.numAdults).toBe(2);
		expect(k.numChildren).toBe(0);
		expect(k.productCode).toBe(4);
		expect(k.productName).toBe('Dagpas');
		expect(k.stationUic).toBe(8400000 + 123);
		expect(k.specimen).toBe(false);
	});

	it('resolves the single year digit against the reference date', () => {
		// digit 4 with a 2024 reference means 2024, never a future year
		const e = parseSsb(ssb(NS_RICS, 21, keycard({ yearDigit: 4, issuingDay: 100 })), REFERENCE);
		if (e.data?.kind !== 'ns-keycard') return;
		expect(e.data.issuingDate).toBe('2024-04-09');
		expect(e.data.validityStart).toBe('2024-04-09');
		expect(e.data.validityEnd).toBe('2024-05-09');

		// digit 9 cannot mean 2029 when the reference is 2024
		const older = parseSsb(ssb(NS_RICS, 21, keycard({ yearDigit: 9, issuingDay: 1 })), REFERENCE);
		if (older.data?.kind !== 'ns-keycard') return;
		expect(older.data.issuingDate.startsWith('2019')).toBe(true);
	});

	it('inverts the specimen bit, unlike other SSB records', () => {
		const real = parseSsb(ssb(NS_RICS, 21, keycard({ specimen: false })), REFERENCE);
		const specimen = parseSsb(ssb(NS_RICS, 21, keycard({ specimen: true })), REFERENCE);
		expect(real.data?.kind === 'ns-keycard' && real.data.specimen).toBe(false);
		expect(specimen.data?.kind === 'ns-keycard' && specimen.data.specimen).toBe(true);
	});

	it('is reached through the format dispatcher', () => {
		const container = parsePayload(ssb(NS_RICS, 21, keycard()));
		expect(container.kind).toBe('ssb');
	});
});
