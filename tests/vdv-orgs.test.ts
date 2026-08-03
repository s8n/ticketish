/**
 * VDV organisation names: the bundled eTicketInfo table plus this repo's
 * overrides on top.
 *
 * The IDs here are organisation numbers, not values off anyone's ticket.
 */
import { describe, expect, it } from 'vitest';
import { loadVdvOrgs, vdvOrgLabel, vdvOrgName, vdvOrgSource } from '../src/lib/tickets/vdv/orgs.ts';
import orgsJson from '../src/lib/tickets/vdv/orgs.json' with { type: 'json' };

describe('orgs.json', () => {
	it('keeps the attribution note beside the data', () => {
		// the whole point of the note is that it travels with the table
		expect(orgsJson._note).toMatch(/eTicketinfo/i);
		expect(orgsJson._note).toMatch(/licence applies/i);
		expect(orgsJson._note).toMatch(/commercial/i);
	});

	it('is a flat map of numeric ids to non-empty names', () => {
		const entries = Object.entries(orgsJson.orgs);
		expect(entries.length).toBeGreaterThan(1500);
		for (const [id, name] of entries) {
			expect(id, `key ${id}`).toMatch(/^\d+$/);
			expect(name.trim(), `name for ${id}`).not.toBe('');
		}
	});
});

describe('vdvOrgName', () => {
	it('resolves ids from the loaded table', async () => {
		const orgs = await loadVdvOrgs();
		expect(vdvOrgName(orgs, 2)).toBe('DB Regio NRW GmbH');
		expect(vdvOrgName(orgs, 4)).toBe('Hamburger Hochbahn AG');
	});

	it('caches, so the table is only imported once', async () => {
		expect(await loadVdvOrgs()).toBe(await loadVdvOrgs());
	});

	it('lets this repo override the bundled table', async () => {
		const orgs = await loadVdvOrgs();
		// the NRW tariff specification names 6212 as KCM; the bundled table
		// calls it Rhein-Sieg, the same name it gives 102
		expect(orgs['6212']).toBe('Verkehrsverbund Rhein-Sieg GmbH');
		expect(vdvOrgName(orgs, 6212)).toBe('Kompetenzcenter Marketing NRW (KCM)');
		expect(vdvOrgSource(6212)).toBe('KCD NRW tariff specification');

		// and to fix a typo in it
		expect(orgs['6292']).toBe('Münchner Verkehrgesellschaft mbH');
		expect(vdvOrgName(orgs, 6292)).toBe('Münchner Verkehrsgesellschaft (MVG)');
	});

	it('attributes anything it did not override to the bundled table', () => {
		expect(vdvOrgSource(2)).toBe('eTicketInfo organisation table');
	});

	it('works before the table has loaded, and for ids nobody knows', () => {
		// the header renders before the fetch resolves
		expect(vdvOrgName(null, 2)).toBeNull();
		// an override still resolves without the table
		expect(vdvOrgName(null, 6212)).toBe('Kompetenzcenter Marketing NRW (KCM)');
		expect(vdvOrgName({}, 999999)).toBeNull();
		expect(vdvOrgName(null, null)).toBeNull();
		expect(vdvOrgName(null, undefined)).toBeNull();
	});
});

describe('vdvOrgLabel', () => {
	it('shows the name with the id, or the bare id when unknown', async () => {
		const orgs = await loadVdvOrgs();
		expect(vdvOrgLabel(orgs, 2)).toBe('DB Regio NRW GmbH (2)');
		expect(vdvOrgLabel(orgs, 999999)).toBe('org 999999');
		// before the table lands, which is what the view shows first
		expect(vdvOrgLabel(null, 2)).toBe('org 2');
		expect(vdvOrgLabel(null, null)).toBe('unknown');
	});
});
