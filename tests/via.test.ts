// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

import { describe, expect, it } from 'vitest';
import { LEITPUNKT_EDITION, parseDbVia, type ViaItem } from '../src/lib/tickets/via.ts';
import leitpunkte from '../src/lib/tickets/data/db-leitpunkte.json' with { type: 'json' };

const codes = (items: ViaItem[]): unknown[] =>
	items.map((i) => (i.kind === 'point' ? i.code : i.choices.map(codes)));

describe('DB via route parser', () => {
	it('parses a route with alternatives', () => {
		const route = parseDbVia('Via: <1080>HAR*(HH*LWL*WBE/UE*SAW*SDL)*BSP');
		expect(route).not.toBeNull();
		expect(route!.length).toBe(1);
		// no table passed, so the carrier stays a code and the view prints it
		expect(route![0].carriers).toEqual([{ code: '1080', name: null }]);
		expect(codes(route![0].items)).toEqual([
			'HAR',
			[
				['HH', 'LWL', 'WBE'],
				['UE', 'SAW', 'SDL']
			],
			'BSP'
		]);
	});

	it('names the carrier when the caller has the organisation table', async () => {
		const { loadIssuerNames } = await import('../src/lib/tickets/uic/rics.ts');
		const route = parseDbVia('Via: <1080>HH*FF', await loadIssuerNames());
		expect(route![0].carriers).toEqual([{ code: '1080', name: 'DB AG (Deutsche Bahn AG)' }]);
	});

	it('parses the Super Sparpreis fixture via', () => {
		const route = parseDbVia('Via: <1080>(HD*BR*BRT/GRAB*KA*PF)*VAI*S*PLO');
		expect(route).not.toBeNull();
		expect(codes(route![0].items)).toEqual([
			[
				['HD', 'BR', 'BRT'],
				['GRAB', 'KA', 'PF']
			],
			'VAI',
			'S',
			'PLO'
		]);
	});

	it('resolves Leitpunkt names', () => {
		const route = parseDbVia('Via: <1080>HH*FF')!;
		const first = route[0].items[0];
		expect(first.kind).toBe('point');
		if (first.kind === 'point') expect(first.name).toMatch(/Hamburg/);
	});

	it('keeps non-alternative parens literal', () => {
		const route = parseDbVia('Via: <1080>A*(B)*C')!;
		expect(codes(route[0].items)).toEqual(['A', '(B)', 'C']);
	});

	it('handles multiple carriers', () => {
		const route = parseDbVia('Via: <1080>NV*H<0800>HB')!;
		expect(route.length).toBe(2);
		expect(route[0].carriers[0].code).toBe('1080');
		expect(route[1].carriers[0].code).toBe('0800');
		expect(codes(route[1].items)).toEqual(['HB']);
	});

	it('returns null for non-via text', () => {
		expect(parseDbVia('just some text')).toBeNull();
		expect(parseDbVia('')).toBeNull();
	});
});

describe('the Leitpunkt table', () => {
	it('says where it came from and which edition it is', () => {
		expect(leitpunkte._note).toMatch(/Entfernungswerk/);
		// an annual document, so the year in here is what says whether the
		// names are current
		expect(LEITPUNKT_EDITION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('maps short upper case codes to non-empty names', () => {
		const entries = Object.entries(leitpunkte.points);
		expect(entries.length).toBeGreaterThan(500);
		for (const [code, name] of entries) {
			// one to four letters, no digits: a Via text is parsed on that shape
			expect(code, `key ${code}`).toMatch(/^[A-Z]{1,4}$/);
			expect(name.trim(), `name for ${code}`).not.toBe('');
		}
	});

	it('is the tariff space and not DS100, which abbreviates the same stations', () => {
		// Augsburg Hbf is MA to the infrastructure side and A to the tariff
		// side, and a Via text is written in the latter. MA is in this table
		// too and means Mannheim, so reading one space as the other does not
		// fail, it just moves the route 300km.
		const points = leitpunkte.points as Record<string, string>;
		expect(points['A']).toBe('Augsburg Hbf');
		expect(points['MA']).toBe('Mannheim Hbf');
	});
});
