// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Issuer names by company code: ERA's Organisation Code register, with
 * rics.json completing it for the codes outside the EU.
 *
 * The codes below are public company codes from those registers, not values
 * taken off anyone's ticket.
 */
import { describe, expect, it } from 'vitest';
import {
	loadIssuerNames,
	loadRicsNames,
	ricsName,
	type RicsTable
} from '../src/lib/tickets/uic/rics.ts';
import ricsNames from '../src/lib/tickets/uic/rics.json' with { type: 'json' };

describe('rics.json', () => {
	const table: RicsTable = ricsNames.orgs;

	it('keeps the source credit beside the data', () => {
		// it is built from ERA's export like era-orgs.json, so it carries the
		// same acknowledgement
		expect(ricsNames._note).toMatch(/European Union Agency for Railways/);
		expect(ricsNames._note).toMatch(/rics-era-overrides\.json/);
	});

	it('is a map of decimal codes to the organisations that hold them', () => {
		const entries = Object.entries(table);
		expect(entries.length).toBeGreaterThan(100);
		for (const [code, org] of entries) {
			expect(code, `key ${code}`).toMatch(/^\d{4}$/);
			expect(org.n.trim(), `name for ${code}`).not.toBe('');
			// UIC gives an end of validity rather than a revocation, so that is
			// the field, and the label weighs it against the day it is read
			expect(org.until ?? '2015-06-30', `until for ${code}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('takes an end of validity from the overrides where the register misses one', async () => {
		const names = await loadIssuerNames();
		// UIC's own register ends 0061 in 2000 and ERA still mirrors it as
		// current, so the override says so on top of the register's name
		expect(ricsName(61, names)).toMatch(/\(Expired \d{4}-\d{2}-\d{2}, RICS 0061\)$/);
		expect(ricsName(61, names)).toMatch(/Korea Railroad Corporation/);
	});

	it('holds what the register calls a RICS code, and none of what it does not', async () => {
		const { era } = await loadIssuerNames();
		// the split is the register's own, so the two tables never both answer
		for (const code of Object.keys(table)) expect(era?.[code], `code ${code}`).toBeUndefined();
		// Swiss and Turkish operators are UIC's to allocate
		expect(table['0085']?.n).toMatch(/Swiss Federal Railways/);
		expect(table['0075']?.a).toMatch(/TCDD/);
	});

	it('loads on demand and caches', async () => {
		expect(await loadRicsNames()).toBe(await loadRicsNames());
	});
});

describe('ricsName', () => {
	it('needs the tables, and shows nothing without them', () => {
		// a caller that has not loaded them renders the raw code, which is what
		// every caller did before either table existed
		expect(ricsName(1080)).toBeNull();
		expect(ricsName('0080')).toBeNull();
	});

	it('names a code from the register, acronym first where it has one', async () => {
		const names = await loadIssuerNames();
		expect(ricsName(3213, names)).toBe('HVV (Hamburger Verkehrsverbund GmbH)');
		expect(ricsName(1080, names)).toBe('DB AG (Deutsche Bahn AG)');
		// and the name alone where it does not
		expect(ricsName(1071, names)).toBe('Renfe Operadora');
		expect(ricsName(24, names)).toMatch(/Lietuvos geležinkeliai/);
	});

	it('takes a string code, including one with leading zeros', async () => {
		// U_HEAD writes the code as fixed-width digits
		const names = await loadIssuerNames();
		expect(ricsName('80', names)).toBe(ricsName(80, names));
		expect(ricsName('0080', names)).toBe(ricsName(80, names));
		expect(ricsName('2480', names)).toMatch(/DB Fernverkehr/);
		// the same has to hold for the half of the numbering rics.json answers,
		// which is keyed the way the register writes a code rather than in
		// decimal: 85 and "0085" are both SBB
		expect(ricsName(85, names)).toMatch(/Swiss Federal Railways/);
		expect(ricsName('0085', names)).toBe(ricsName(85, names));
	});

	it('completes the register from rics.json, without overriding it', async () => {
		const names = await loadIssuerNames();
		const outsideTheEu = {
			era: names.era,
			rics: { '2480': { n: 'Not DB' }, '9998': { n: 'Some railway' } }
		};
		// the register keeps the codes it holds
		expect(ricsName(2480, outsideTheEu)).toMatch(/DB Fernverkehr/);
		// and rics.json answers for the ones it does not
		expect(ricsName(9998, outsideTheEu)).toBe('Some railway');
	});

	it('returns null rather than a placeholder for anything it does not know', async () => {
		// callers render their own "RICS <n>" fallback
		const names = await loadIssuerNames();
		expect(ricsName(99999, names)).toBeNull();
		expect(ricsName(null, names)).toBeNull();
		expect(ricsName(undefined, names)).toBeNull();
		expect(ricsName('', names)).toBeNull();
		expect(ricsName('not a code', names)).toBeNull();
	});
});
