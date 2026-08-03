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
		// 80 and 1080 are DB Fernverkehr, 3080 DB Regio, 5080 DB Vertrieb: the
		// name on the ticket varies, the colour should not
		for (const code of [80, 1080, 3080, 5080]) {
			expect(colouredOperatorName({ scheme: 'rics', code })).toBe('Deutsche Bahn');
			expect(passColors({ scheme: 'rics', code }).hex).toBe('#ee0020');
		}
	});

	it('does not confuse the two numbering spaces', () => {
		// 80 means DB in the UIC space and nothing here in VDV's
		expect(colouredOperatorName({ scheme: 'vdv', code: 80 })).toBeNull();
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
