// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * How a name and an acronym are shown together, which every register that has
 * the two asks the same way.
 *
 * The cases are written out here rather than looked up, so a rename in any of
 * the registers cannot turn a rule off without anybody noticing.
 */
import { describe, expect, it } from 'vitest';
import { codeLabel, orgLabel } from '../src/lib/tickets/orglabel.ts';

describe('orgLabel', () => {
	it('leads with the acronym, since that is what an operator is called', () => {
		expect(orgLabel('Hamburger Verkehrsverbund GmbH', 'HVV')).toBe(
			'HVV (Hamburger Verkehrsverbund GmbH)'
		);
	});

	it('is just the name where there is no acronym', () => {
		expect(orgLabel('Renfe Operadora')).toBe('Renfe Operadora');
		expect(orgLabel('Renfe Operadora', '')).toBe('Renfe Operadora');
	});

	it('shows one where the acronym is the name again', () => {
		// the name carries the acronym plus the legal form
		expect(orgLabel('DB Fernverkehr AG', 'DB Fernverkehr')).toBe('DB Fernverkehr AG');
		// the same words, punctuated differently: the name wins
		expect(orgLabel('SNCF-Voyageurs', 'SNCF Voyageurs')).toBe('SNCF-Voyageurs');
		// and the other way round, where the acronym field holds the longer text
		expect(orgLabel('IDS Cargo a.s.', 'IDS C, IDS CARGO a.s.')).toBe('IDS C, IDS CARGO a.s.');
	});

	it('compares in every script, not just the Latin one', () => {
		// a-z would erase these to nothing, and nothing is inside any acronym,
		// so the name would be the part that got dropped
		expect(orgLabel('Укрзалізниця', 'UZ')).toBe('UZ (Укрзалізниця)');
		expect(orgLabel('Ρυθμιστική Αρχή Σιδηροδρόμων', 'ΡΑΣ')).toBe(
			'ΡΑΣ (Ρυθμιστική Αρχή Σιδηροδρόμων)'
		);
		expect(orgLabel('Łódzka Kolej Aglomeracyjna', 'ŁKA')).toBe('ŁKA (Łódzka Kolej Aglomeracyjna)');
		// Turkish İ lower cases to an i with a dot that has to come off too
		expect(orgLabel('İstanbul Demiryolu', 'istanbul demiryolu')).toBe('İstanbul Demiryolu');
	});

	it('ignores an acronym with nothing in it to read', () => {
		// a register can have the column filled with "-" or "---"
		expect(orgLabel('Eiffage Infra-Nordwest GmbH', '---')).toBe('Eiffage Infra-Nordwest GmbH');
	});
});

describe('codeLabel', () => {
	const day = new Date('2026-08-12');

	it("is the plain label while the code is still somebody's", () => {
		expect(codeLabel({ n: 'DB InfraGO', a: 'DB InfraGO' }, '0080', 'org', day)).toBe('DB InfraGO');
	});

	it('names the numbering, so the reader knows which code lapsed', () => {
		const org = { n: 'High Speed Alliance', revoked: '2015-06-30' };
		expect(codeLabel(org, 1284, 'RICS', day)).toBe(
			'High Speed Alliance (Revoked 2015-06-30, RICS 1284)'
		);
		expect(codeLabel(org, '0068', 'org', day)).toBe(
			'High Speed Alliance (Revoked 2015-06-30, org 0068)'
		);
	});

	it('says a revocation whatever the day is, since it has already happened', () => {
		const org = { n: 'Nederlandse Spoorwegen', revoked: '2026-05-20' };
		expect(codeLabel(org, 1084, 'org', new Date('2020-01-01'))).toContain('(Revoked 2026-05-20');
		// and an undated one is still a revocation
		expect(codeLabel({ n: 'Somebody', revoked: '' }, 9902, 'org', day)).toBe(
			'Somebody (Revoked, org 9902)'
		);
	});

	it('weighs an end of validity against the day it is read', () => {
		const org = { n: 'Südostbahn Gemeinschaft', a: 'SOB Gem', until: '2026-08-12' };
		// the last day of validity is still a day of validity
		expect(codeLabel(org, 70, 'GO-Nr.', day)).toBe('SOB Gem (Südostbahn Gemeinschaft)');
		expect(codeLabel(org, 70, 'GO-Nr.', new Date('2026-08-13'))).toBe(
			'SOB Gem (Südostbahn Gemeinschaft) (Expired 2026-08-12, GO-Nr. 70)'
		);
	});

	it('says both where a register gives both', () => {
		const org = { n: 'Somebody', revoked: '2020-01-01', until: '2019-06-30' };
		expect(codeLabel(org, 42, 'org', day)).toBe(
			'Somebody (Revoked 2020-01-01, org 42) (Expired 2019-06-30, org 42)'
		);
	});
});
