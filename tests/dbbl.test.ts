// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * DB's 0080BL record: a certificate list, then S-fields as id, length and
 * value. Built field by field from invented values.
 */
import { describe, expect, it } from 'vitest';
import '../src/lib/tickets/records/dbbl.ts';
import type { DbBlData } from '../src/lib/tickets/records/dbbl.ts';
import { parseRecord } from '../src/lib/tickets/registry.ts';

/** One S-field: four character id, four digit length, value. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(4, '0')}${value}`;

function bl(fields: [string, string][], version = 3): DbBlData {
	const cert =
		version === 3
			? '01032026' + '31032026' + 'CERT000001'
			: ' '.repeat(22) + '01032026' + '31032026' + ' '.repeat(8);
	const body =
		'02' + // ticket type
		'1' + // one certificate
		cert +
		String(fields.length).padStart(2, '0') +
		fields.map(([id, value]) => field(id, value)).join('');
	const parsed = parseRecord(
		{ id: '0080BL', version, data: new TextEncoder().encode(body), utf8Length: false },
		{}
	);
	expect(parsed.kind).toBe('db-bl');
	return parsed.data as DbBlData;
}

describe('0080BL', () => {
	it('reads the certificate validity in both layouts', () => {
		for (const version of [2, 3]) {
			const [cert] = bl([], version).certs;
			expect(cert.validFrom, `v${version}`).toBe('2026-03-01');
			expect(cert.validTo, `v${version}`).toBe('2026-03-31');
		}
		expect(bl([]).certs[0].id).toBe('CERT000001');
	});

	it('reads the journey out of its S-fields', () => {
		const t = bl([
			['S001', 'Flexpreis'],
			['S014', 'S2'],
			['S015', 'Alpha Hbf'],
			['S016', 'Beta Hbf'],
			['S021', 'VIA GAMMA'],
			['S031', '01.03.2026'],
			['S032', '02.03.2026'],
			['S035', '12345'],
			['S036', '54321']
		]);
		expect(t.product).toBe('Flexpreis');
		expect(t.serviceClass).toBe('second');
		expect(t.fromStationName).toBe('Alpha Hbf');
		expect(t.toStationName).toBe('Beta Hbf');
		expect(t.route).toBe('VIA GAMMA');
		expect(t.validityStart).toBe('2026-03-01');
		expect(t.validityEnd).toBe('2026-03-02');
		// the station numbers are the domestic part of a German UIC code
		expect(t.fromStationUic).toBe(8012345);
		expect(t.toStationUic).toBe(8054321);
	});

	it('reads the travellers and their BahnCards', () => {
		const t = bl([
			['S009', '2-1-49'],
			['S012', '1'],
			['S028', 'Test#Traveller'],
			['S040', '3']
		]);
		expect(t.numAdults).toBe(2);
		expect(t.numBahncards).toBe(1);
		expect(t.bahncardType).toBe('BC25');
		expect(t.numChildren).toBe(1);
		expect(t.travellerForename).toBe('Test');
		expect(t.travellerSurname).toBe('Traveller');
		expect(t.numTravellers).toBe(3);
	});

	it('keeps the S-fields it does not name', () => {
		expect(bl([['S099', 'something']]).blocks).toEqual({ S099: 'something' });
	});

	it('refuses a version it does not know', () => {
		const parsed = parseRecord(
			{ id: '0080BL', version: 9, data: new TextEncoder().encode('021'), utf8Length: false },
			{}
		);
		expect(parsed.kind).toBe('unknown');
		expect(parsed.error).toMatch(/unsupported 0080BL version 9/);
	});
});
