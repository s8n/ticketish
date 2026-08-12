// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * ERA Organisation Codes: the register behind the curated RICS names.
 *
 * The codes here are public company codes out of ERA's own published table,
 * not values off anyone's ticket. Names are asserted loosely where they are
 * asserted at all: the table is rebuilt monthly and an organisation is free
 * to change its legal form without breaking a test.
 */
import { describe, expect, it } from 'vitest';
import {
	eraCode,
	eraEdition,
	eraOrg,
	eraOrgLabel,
	eraOrgName,
	loadEraOrgs,
	type EraOrg
} from '../src/lib/tickets/uic/era-orgs.ts';
import eraJson from '../src/lib/tickets/uic/era-orgs.json' with { type: 'json' };

// the import types every entry as its own literal shape, which is 5,881 of
// them and not the point; the file is one table of one type
const table: Record<string, EraOrg> = eraJson.orgs;

describe('era-orgs.json', () => {
	it('keeps the ERA attribution beside the data', () => {
		// reproduction is authorised provided the source is acknowledged, so the
		// acknowledgement travels with the table rather than in a doc somewhere
		expect(eraJson._note).toMatch(/European Union Agency for Railways/);
		expect(eraJson._note).toMatch(/source is acknowledged/i);
		expect(eraJson._note).toMatch(/teleref\.era\.europa\.eu/);
		// and what was dropped from the original, which is most of it
		expect(eraJson._note).toMatch(/Modified from the original/);
	});

	it('says which export it was built from', () => {
		expect(eraJson._edition).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('is a map of four character codes to non-empty names', () => {
		const entries = Object.entries(table);
		expect(entries.length).toBeGreaterThan(4000);
		for (const [code, org] of entries) {
			expect(code, `key ${code}`).toMatch(/^[0-9A-Z]{4}$/);
			expect(org.n.trim(), `name for ${code}`).not.toBe('');
			expect(org.n, `name for ${code}`).toBe(org.n.trim());
		}
	});

	it('keeps the leading zero on a numeric code', () => {
		// 0060 is Iarnród Éireann; a code that lost its zero would collide with
		// whatever holds 60 in another spreadsheet's idea of the same register
		const numeric = Object.keys(table).filter((c) => /^\d+$/.test(c));
		expect(numeric.length).toBeGreaterThan(1500);
		for (const code of numeric) expect(code).toHaveLength(4);
	});

	it('dates a revoked code beside the name, and gives it no acronym', () => {
		const revoked = Object.entries(table).filter(([, org]) => org.revoked !== undefined);
		expect(revoked.length).toBeGreaterThan(150);
		for (const [code, org] of revoked) {
			expect(org.revoked, `revocation date for ${code}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			// the name stays the organisation's name; the app says the rest
			expect(org.n, `name for ${code}`).not.toContain('Revoked');
			expect(org.a, `acronym for ${code}`).toBeUndefined();
		}
	});

	it('holds no contact details, only the code, name, acronym and country', () => {
		// the export carries address, email and phone as well; those stay in the
		// spreadsheet, which is the whole reason the script names its columns
		const allowed = new Set(['n', 'a', 'c', 'revoked', 'until']);
		for (const [code, org] of Object.entries(table)) {
			for (const key of Object.keys(org)) expect(allowed, `${key} on ${code}`).toContain(key);
			expect(org.n, `name for ${code}`).toBeTruthy();
		}
	});

	it('gives the country as a two letter code, or not at all', () => {
		const placed = Object.entries(table).filter(([, org]) => org.c);
		expect(placed.length).toBeGreaterThan(1000);
		for (const [code, org] of placed) {
			expect(org.c, `country for ${code}`).toMatch(/^[A-Z]{2}$/);
		}
		expect(table['0080']?.c).toBe('DE');
		expect(table['1187']?.c).toBe('FR');
		// the revoked sheet has no country column, so those entries have none
		const revoked = Object.values(table).filter((o) => o.n.includes('(Revoked '));
		expect(revoked.every((o) => o.c === undefined)).toBe(true);
	});
});

describe('eraCode', () => {
	it('pads a numeric code to the four digits the register writes', () => {
		expect(eraCode(80)).toBe('0080');
		expect(eraCode('80')).toBe('0080');
		expect(eraCode('0080')).toBe('0080');
		expect(eraCode(1181)).toBe('1181');
	});

	it('upper cases an alphanumeric code and leaves it alone otherwise', () => {
		expect(eraCode('inml')).toBe('INML');
		expect(eraCode('4XDU')).toBe('4XDU');
	});

	it('has nothing to say about an absent code', () => {
		expect(eraCode(null)).toBeNull();
		expect(eraCode(undefined)).toBeNull();
		expect(eraCode('')).toBeNull();
		expect(eraCode('   ')).toBeNull();
	});
});

describe('eraOrgName', () => {
	it('resolves codes from the loaded table, numeric or not', async () => {
		const orgs = await loadEraOrgs();
		expect(eraOrgName(orgs, 2480)).toMatch(/DB Fernverkehr/);
		expect(eraOrgName(orgs, '0060')).toMatch(/Iarnród Éireann/);
		expect(eraOrgName(orgs, 60)).toMatch(/Iarnród Éireann/);
		expect(eraOrgName(orgs, 1187)).toMatch(/SNCF/);
		// an ERA allocation that is not a RICS code at all
		expect(eraOrgName(orgs, 'INML')).toMatch(/ALBRAIL/i);
	});

	it('resolves a second code to the organisation that holds it', async () => {
		const orgs = await loadEraOrgs();
		// ÖBB-Personenverkehr lists 1281 beside 1181, and both are the same firm
		expect(eraOrgName(orgs, 1281)).toBe(eraOrgName(orgs, 1181));
	});

	it('still names the holder of a code ERA has withdrawn', async () => {
		const orgs = await loadEraOrgs();
		// a ticket outlives the allocation it was issued under, and the name is
		// the organisation's own: the revocation is said by the label
		expect(eraOrgName(orgs, 9902)).toMatch(/^Eurail Group/);
		expect(eraOrgName(orgs, 9902)).not.toContain('Revoked');
	});

	it('gives a reallocated code to the organisation that holds it now', async () => {
		const orgs = await loadEraOrgs();
		// 5199 is on both sheets; the active allocation is the answer
		expect(eraOrgName(orgs, 5199)).not.toContain('Revoked');
	});

	it('returns null rather than a placeholder for anything it does not know', async () => {
		const orgs = await loadEraOrgs();
		expect(eraOrgName(orgs, 'ZZZZ')).toBeNull();
		expect(eraOrgName(orgs, null)).toBeNull();
		expect(eraOrgName(null, 1187)).toBeNull();
	});

	it('caches, so the table is only imported once', async () => {
		expect(await loadEraOrgs()).toBe(await loadEraOrgs());
	});

	it('reports the edition once the table has loaded', async () => {
		await loadEraOrgs();
		expect(eraEdition()).toBe(eraJson._edition);
	});
});

describe('eraOrgLabel', () => {
	it('leads with the acronym where the register has one', async () => {
		const orgs = await loadEraOrgs();
		const org = eraOrg(orgs, '0060');
		expect(org?.a).toBeTruthy();
		// the acronym is what an operator is spoken about as, so it comes first.
		// orglabel.test.ts has the rules; this is the register meeting them.
		expect(eraOrgLabel(orgs, '0060')).toBe(`${org!.a} (${org!.n})`);
		expect(eraOrgLabel(orgs, 3213)).toBe('HVV (Hamburger Verkehrsverbund GmbH)');
	});

	it('says a revoked code is revoked, and when', () => {
		const orgs = {
			'0068': { n: 'AAE Ahaus Alstätter Eisenbahn Cargo AG', revoked: '2016-01-13' },
			'9902': { n: 'Eurail Group G.I.E. management', revoked: '' }
		};
		expect(eraOrgLabel(orgs, 68)).toBe(
			'AAE Ahaus Alstätter Eisenbahn Cargo AG (Revoked 2016-01-13, org 0068)'
		);
		// a revocation the register gives no date for is still a revocation
		expect(eraOrgLabel(orgs, 9902)).toBe('Eurail Group G.I.E. management (Revoked, org 9902)');
	});

	it('is just the name where it does not', async () => {
		const orgs = await loadEraOrgs();
		// Renfe Operadora is registered without one
		expect(eraOrg(orgs, '1071')?.a).toBeUndefined();
		expect(eraOrgLabel(orgs, '1071')).toBe(eraOrgName(orgs, '1071'));
	});
});
