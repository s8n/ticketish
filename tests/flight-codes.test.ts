// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The two bundled tables that turn a boarding pass's codes into names.
 *
 * Both are regenerated monthly from outside this repo, so what is checked
 * here is the shape they have to keep and the terms they have to carry, not
 * any particular airport or airline. The codes below are IATA's, printed on
 * every pass ever issued for those routes, and are not from anyone's ticket.
 */
import { describe, expect, it } from 'vitest';
import airportsJson from '../src/lib/tickets/data/airports.json' with { type: 'json' };
import airlinesJson from '../src/lib/tickets/data/airlines.json' with { type: 'json' };

const airports = airportsJson.airports as Record<string, string[]>;
const airlines = airlinesJson.airlines as unknown as Record<string, (string | number)[][]>;

describe('airports.json', () => {
	it('keeps the attribution note beside the data', () => {
		// PDDL asks for nothing, but a table nobody can trace is unusable
		expect(airportsJson._note).toMatch(/ourairports/i);
		expect(airportsJson._note).toMatch(/PDDL/);
		expect(airportsJson._note).toMatch(/build-airports\.py/);
	});

	it('is keyed by three letter IATA codes with a name apiece', () => {
		const entries = Object.entries(airports);
		expect(entries.length).toBeGreaterThan(7000);
		for (const [code, entry] of entries) {
			expect(code, `key ${code}`).toMatch(/^[A-Z]{3}$/);
			expect(entry.length, `entry for ${code}`).toBeGreaterThanOrEqual(1);
			expect(entry.length, `entry for ${code}`).toBeLessThanOrEqual(3);
			expect(entry[0].trim(), `name for ${code}`).not.toBe('');
		}
	});

	it('drops the trailing word every airport name shares', () => {
		for (const [code, entry] of Object.entries(airports)) {
			expect(entry[0], `name for ${code}`).not.toMatch(/ Airport$/);
		}
	});
});

describe('airlines.json', () => {
	it('carries the attribution it was built under', () => {
		expect(airlinesJson._note).toMatch(/opentraveldata/i);
		expect(airlinesJson._note).toMatch(/Creative Commons Attribution 4\.0/i);
		expect(airlinesJson._note).toMatch(/build-airlines\.py/);
	});

	it('is keyed by two character IATA designators, each with its holders', () => {
		const entries = Object.entries(airlines);
		expect(entries.length).toBeGreaterThan(900);
		for (const [code, holders] of entries) {
			expect(code, `key ${code}`).toMatch(/^[A-Z0-9]{2}$/);
			expect(holders.length, `holders of ${code}`).toBeGreaterThan(0);
			for (const holder of holders) {
				expect(String(holder[0]).trim(), `name for ${code}`).not.toBe('');
				expect(holder.length, `entry for ${code}`).toBeLessThanOrEqual(5);
			}
		}
	});

	it('dates every holding as an ISO date or an open end', () => {
		for (const [code, holders] of Object.entries(airlines)) {
			for (const holder of holders) {
				for (const at of [1, 2]) {
					const value = holder[at];
					if (value === undefined || value === '') continue;
					expect(String(value), `date on ${code}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				}
			}
		}
	});

	it("keeps the source's placeholder designators out", () => {
		// toHaveProperty reads a dot as a path separator, so ".." would not be
		// looking for the key it says it is
		const codes = Object.keys(airlines);
		for (const junk of ['..', '^^', '--', '&T', 'АЯ']) {
			expect(codes, `designator ${junk}`).not.toContain(junk);
		}
	});

	it('records the handover that a single name per code cannot express', () => {
		// the case that sent us to a dated source in the first place
		const az = airlines.AZ.map((h) => h[0]);
		expect(az).toContain('Alitalia');
		expect(az).toContain('ITA Airways');
	});

	it('tells the two airlines that share LH apart by what they carry', () => {
		const lh = airlines.LH;
		expect(lh.length).toBe(2);
		expect(lh.find((h) => h[0] === 'Lufthansa')?.[4]).toBe('P');
		expect(lh.find((h) => h[0] === 'Lufthansa Cargo')?.[4]).toBe('C');
	});

	it('carries the accounting codes that boarding passes bill under', () => {
		// item 142, checked against what the sample passes actually contain
		const num = (code: string, name: string) =>
			airlines[code].find((h) => h[0] === name)?.[3];
		expect(num('BA', 'British Airways')).toBe(125);
		expect(num('TK', 'Turkish Airlines')).toBe(235);
		expect(num('AY', 'Finnair')).toBe(105);
		expect(num('LG', 'Luxair')).toBe(149);
		expect(num('KC', 'Air Astana')).toBe(465);
	});
});
