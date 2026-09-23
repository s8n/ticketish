// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The preview promises what the pass will say, so every writer takes its
 * labelled rows from the same list. Each shows a different subset, since each
 * has some fields of its own, but none may label a row differently from the
 * preview or leave out the details the mapping found.
 */
import { describe, expect, it } from 'vitest';
import { previewFields, type TripSummary } from '../src/lib/wallet/trip.ts';
import { buildPassJson } from '../src/lib/wallet/pkpass.ts';
import { buildGenericObject } from '../src/lib/wallet/google.ts';
import { buildIcs } from '../src/lib/wallet/calendar.ts';

const trip: TripSummary = {
	shape: 'journey',
	issuer: 'Test Railways',
	product: 'Flex ticket',
	from: 'Alpha Hbf',
	to: 'Beta Hbf',
	via: 'Gamma',
	train: 'ICE 1',
	departure: '2026-09-01T08:15',
	travelClass: '2nd class',
	passenger: 'A Traveller',
	ticketId: 'T1',
	reference: 'REF1',
	price: '10.00 EUR',
	details: [{ label: 'Railcard', value: 'BahnCard 25' }]
};
const payload = new TextEncoder().encode('HELLO');
const preview = new Map(previewFields(trip).map((f) => [f.label, f.value]));

describe('the rows each writer shows', () => {
	it('are labelled and valued as the preview has them, in Apple Wallet', () => {
		const pass = buildPassJson({
			trip,
			payload,
			symbology: { format: 'Aztec' },
			passTypeIdentifier: 'pass.test',
			teamIdentifier: 'TEAM',
			serialNumber: '1'
		}) as { boardingPass: { backFields: { label: string; value: string }[] } };
		const back = pass.boardingPass.backFields.filter((f) => f.label !== 'Unofficial pass');
		for (const f of back) expect(preview.get(f.label), f.label).toBe(f.value);
		expect(back.map((f) => f.label)).toContain('Railcard');
	});

	it('are labelled and valued as the preview has them, in Google Wallet', () => {
		const object = buildGenericObject(trip, payload, { format: 'Aztec' }, '333') as {
			textModulesData: { header: string; body: string }[];
		};
		const rows = object.textModulesData.filter((m) => m.header !== 'Unofficial pass');
		for (const m of rows) expect(preview.get(m.header), m.header).toBe(m.body);
		expect(rows.map((m) => m.header)).toContain('Railcard');
	});

	it('are labelled and valued as the preview has them, in the calendar', () => {
		const ics = buildIcs({ trip, uid: 'x', now: new Date('2026-01-01T00:00:00Z') });
		const unfolded = ics.replace(/\r\n /g, '');
		const description = /DESCRIPTION:(.*)/.exec(unfolded)![1].replace(/\\,/g, ',');
		const lines = description.split('\\n').filter((l) => l.includes(': '));
		for (const line of lines) {
			const [label, value] = line.split(': ');
			expect(preview.get(label), label).toBe(value);
		}
		expect(lines.map((l) => l.split(': ')[0])).toContain('Railcard');
	});
});
