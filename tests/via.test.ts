// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

import { describe, expect, it } from 'vitest';
import { parseDbVia, type ViaItem } from '../src/lib/tickets/via.ts';

const codes = (items: ViaItem[]): unknown[] =>
	items.map((i) => (i.kind === 'point' ? i.code : i.choices.map(codes)));

describe('DB via route parser', () => {
	it('parses a route with alternatives', () => {
		const route = parseDbVia('Via: <1080>HAR*(HH*LWL*WBE/UE*SAW*SDL)*BSP');
		expect(route).not.toBeNull();
		expect(route!.length).toBe(1);
		expect(route![0].carriers).toEqual([{ code: '1080', name: 'DB Fernverkehr AG' }]);
		expect(codes(route![0].items)).toEqual([
			'HAR',
			[
				['HH', 'LWL', 'WBE'],
				['UE', 'SAW', 'SDL']
			],
			'BSP'
		]);
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
