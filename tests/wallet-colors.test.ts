// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Operator colours, and the two things that have to hold: an operator is
 * matched on its code rather than on whatever it called itself that year, and
 * the text on a pass stays readable on whatever background the operator has.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { colouredOperatorName, paletteFor, passColors } from '../src/lib/wallet/colors.ts';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { tripFor } from '../src/lib/wallet/trip.ts';

const dir = fileURLToPath(new URL('./fixtures/public', import.meta.url));

describe('matching an operator', () => {
	it('knows DB by every code it issues under', () => {
		// group, sales, long distance and regional, plus the two allocations
		// that were revoked and are still on tickets: the name on the ticket
		// varies, the colour should not
		for (const code of [80, 1080, 1180, 2480, 2580, 3396, 3864]) {
			expect(colouredOperatorName({ scheme: 'rics', code })).toBe('Deutsche Bahn');
			expect(passColors({ scheme: 'rics', code }).hex).toBe('#ee0020');
		}
	});

	it('knows the Swiss operators by both the codes they carry', () => {
		// SBB signs with a UIC company code and sells under a NOVA org id
		for (const code of [85, 1085, 1185]) {
			expect(colouredOperatorName({ scheme: 'rics', code })).toBe('SBB CFF FFS');
		}
		for (const code of [11, 351]) {
			expect(colouredOperatorName({ scheme: 'nova', code })).toBe('SBB CFF FFS');
		}
		for (const code of [5458, 5459, 5460]) {
			expect(colouredOperatorName({ scheme: 'rics', code })).toBe('Schweizerische Südostbahn');
		}
		// 3342 is the Verband öffentlicher Verkehr, which signs NOVA tickets
		// for the whole Swiss sector, so it is nobody's brand colour
		expect(colouredOperatorName({ scheme: 'rics', code: 3342 })).toBeNull();
		expect(passColors({ scheme: 'nova', code: 36 }).hex).toBe('#af6d4b');
	});

	it('colours a tariff association, which holds no company code at all', () => {
		expect(colouredOperatorName({ scheme: 'nova', code: 490 })).toBe('Zürcher Verkehrsverbund');
		expect(passColors({ scheme: 'nova', code: 490 }).hex).toBe('#737171');
		expect(colouredOperatorName({ scheme: 'nova', code: 452 })).toBe('Tarifverbund Ostwind');
		expect(passColors({ scheme: 'nova', code: 452 }).hex).toBe('#09315f');
	});

	it('does not confuse the numbering spaces', () => {
		// 80 means DB in the UIC space and nothing here in VDV's
		expect(colouredOperatorName({ scheme: 'vdv', code: 80 })).toBeNull();
		// 85 is SBB in the UIC space; in NOVA's it is somebody else entirely
		expect(colouredOperatorName({ scheme: 'nova', code: 85 })).toBeNull();
	});

	it('falls back to the app palette for an operator with no colour', () => {
		expect(passColors({ scheme: 'rics', code: 1184 }).hex).toBe('#26324b');
		expect(passColors(undefined).hex).toBe('#26324b');
	});
});

describe('the palette a background implies', () => {
	it('puts light text on a dark background and dark text on a light one', () => {
		expect(paletteFor('#ee0020').foreground).toBe('rgb(255, 255, 255)');
		expect(paletteFor('#111111').foreground).toBe('rgb(255, 255, 255)');
		// a yellow operator would need the other one
		expect(paletteFor('#ffc917').foreground).toBe('rgb(26, 26, 26)');
	});

	it('writes the same colour in both forms the wallets ask for', () => {
		const colors = paletteFor('#ee0020');
		expect(colors.hex).toBe('#ee0020');
		expect(colors.background).toBe('rgb(238, 0, 32)');
	});

	it('keeps the label between the text and the background', () => {
		const { label } = paletteFor('#ee0020');
		const [r, g, b] = label.match(/\d+/g)!.map(Number);
		// mixed back toward the red, so it reads as secondary rather than as
		// a second colour somebody chose
		expect(r).toBeGreaterThan(200);
		expect(g).toBeLessThan(200);
		expect(b).toBeLessThan(200);
	});
});

describe('against a real ticket', () => {
	it('takes DB red from the envelope issuer code', async () => {
		const path = join(dir, 'muster-918-9-fv-supersparpreis.bin');
		if (!existsSync(path)) return;
		const ticket = makeTicket(new Uint8Array(readFileSync(path)), { kind: 'raw' });
		const trip = (await tripFor(ticket))!;
		expect(trip.operator).toEqual({ scheme: 'rics', code: 1080 });
		expect(passColors(trip.operator).hex).toBe('#ee0020');
	});
});
