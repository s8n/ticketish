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
const airlines = airlinesJson.airlines as Record<string, string>;

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
	it('carries the share-alike terms it was built under', () => {
		// this one binds: OpenFlights publishes under ODbL, so the table does too
		expect(airlinesJson._note).toMatch(/openflights/i);
		expect(airlinesJson._note).toMatch(/Open Database License/i);
		expect(airlinesJson._note).toMatch(/derived database/i);
		expect(airlinesJson._note).toMatch(/build-airlines\.py/);
	});

	it('is keyed by two character IATA designators with a name apiece', () => {
		const entries = Object.entries(airlines);
		expect(entries.length).toBeGreaterThan(700);
		for (const [code, name] of entries) {
			expect(code, `key ${code}`).toMatch(/^[A-Z0-9]{2}$/);
			expect(name.trim(), `name for ${code}`).not.toBe('');
		}
	});

	it("keeps the source's placeholder designators out", () => {
		// OpenFlights carries "..", "^^" and a few Cyrillic domestic codes, none
		// of which can appear in a record that is printable ASCII throughout
		// toHaveProperty reads a dot as a path separator, so ".." would not be
		// looking for the key it says it is
		const codes = Object.keys(airlines);
		for (const junk of ['..', '^^', '--', '&T', 'АЯ']) {
			expect(codes, `designator ${junk}`).not.toContain(junk);
		}
	});

	it("carries no leftover escaping from the source's own CSV import", () => {
		for (const [code, name] of Object.entries(airlines)) {
			expect(name, `name for ${code}`).not.toMatch(/\\/);
		}
	});

	it('leaves out the designators two live airlines share', () => {
		// the build script will not choose between a carrier and its cargo arm,
		// so those answers come from the OVERRIDES map beside the loader
		expect(airlines).not.toHaveProperty('LH');
		expect(airlines).not.toHaveProperty('SQ');
	});
});
