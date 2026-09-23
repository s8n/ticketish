// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * DB's 0080VU record, which carries VDV product authorisations inside a UIC
 * 918.3 envelope. Built byte by byte from invented values; the times use the
 * same VDV compact encoding the VDV barcode tests build with.
 */
import { describe, expect, it } from 'vitest';
import '../src/lib/tickets/records/dbvu.ts';
import type { DbVuData } from '../src/lib/tickets/records/dbvu.ts';
import { parseRecord } from '../src/lib/tickets/registry.ts';
import { vdvDateTime } from './helpers/vdv.ts';

const be = (value: number, bytes: number) =>
	Array.from({ length: bytes }, (_, i) => (value >> (8 * (bytes - 1 - i))) & 0xff);

function vu(validFrom: Uint8Array, validTo: Uint8Array): DbVuData {
	const data = new Uint8Array([
		...[0, 0, 0, 0, 0], // the five bytes before the counts
		1, // travellers
		1, // products
		...be(12345, 4), // authorisation number
		...be(6100, 2), // KVP organisation
		...be(9999, 2), // product number
		...be(6100, 2), // PV organisation
		...validFrom,
		...validTo,
		...be(4900, 3), // price in cents
		...be(7, 4), // sequence number
		0 // no product data
	]);
	const parsed = parseRecord({ id: '0080VU', version: 1, data, utf8Length: false }, {});
	expect(parsed.kind).not.toBe('unknown');
	return parsed.data as DbVuData;
}

describe('0080VU', () => {
	it('reads the validity with seconds in two second steps', () => {
		const [p] = vu(vdvDateTime(2026, 3, 1, 8, 15, 46), vdvDateTime(2026, 3, 31, 23, 59, 58)).products;
		expect(p.validFrom).toBe('2026-03-01T08:15:46');
		expect(p.validTo).toBe('2026-03-31T23:59:58');
		expect(p.price).toBe(4900);
	});

	it('reads an hour past 23 as the small hours of the next day', () => {
		const [p] = vu(vdvDateTime(2026, 3, 1, 0, 0), vdvDateTime(2026, 3, 31, 27, 0)).products;
		expect(p.validTo).toBe('2026-04-01T03:00:00');
	});

	it('reads an all-zero time as none given', () => {
		const [p] = vu(vdvDateTime(2026, 3, 1, 0, 0), new Uint8Array(4)).products;
		expect(p.validTo).toBeNull();
	});
});
