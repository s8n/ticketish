/**
 * Station name tables: UIC location codes and SNCF mnemonics.
 *
 * The codes here are either from DB's published Muster specimens or picked off
 * the bundled table itself, never off a real ticket.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	isUicCodeTable,
	loadSncfStations,
	loadUicStations,
	sncfStationLabel,
	sncfStationName,
	uicStationLabel,
	uicStationName
} from '../src/lib/tickets/stations.ts';
import uicJson from '../src/lib/tickets/data/uic-stations.json' with { type: 'json' };
import sncfJson from '../src/lib/tickets/data/sncf-stations.json' with { type: 'json' };

describe('the bundled tables', () => {
	it('keep the attribution note beside the data', () => {
		// the whole point of the note is that it travels with the table
		for (const json of [uicJson, sncfJson]) {
			expect(json._note).toMatch(/trainline-eu\/stations/);
			expect(json._note).toMatch(/ODbL/);
		}
	});

	it('maps seven digit UIC codes to non-empty names', () => {
		const entries = Object.entries(uicJson.stations);
		expect(entries.length).toBeGreaterThan(20000);
		for (const [code, name] of entries) {
			expect(code, `key ${code}`).toMatch(/^\d{7}$/);
			expect(name.trim(), `name for ${code}`).not.toBe('');
		}
	});

	it('maps five letter mnemonics to non-empty names', () => {
		const entries = Object.entries(sncfJson.stations);
		expect(entries.length).toBeGreaterThan(7000);
		for (const [code, name] of entries) {
			expect(code, `key ${code}`).toMatch(/^[A-Z]{5}$/);
			expect(name.trim(), `name for ${code}`).not.toBe('');
		}
	});
});

describe('uicStationName', () => {
	it('resolves codes from the loaded table', async () => {
		const names = await loadUicStations();
		expect(uicStationName(names, 8718201)).toBe('Colmar');
		expect(uicStationName(names, 8721202)).toBe('Strasbourg');
	});

	it('accepts the eight digit form, which is the same code plus a check digit', async () => {
		const names = await loadUicStations();
		expect(uicStationName(names, 87182014)).toBe('Colmar');
		expect(uicStationName(names, '87212027')).toBe('Strasbourg');
	});

	it('uses the UIC numbering, not the domestic IBNR', async () => {
		const names = await loadUicStations();
		// Köln Hbf is UIC 8015458 and IBNR 8000207. The barcode carries the
		// former, so the latter must not be in the table pointing elsewhere.
		expect(uicStationName(names, 8015458)).toBe('Köln Hbf');
		expect(uicStationName(names, 8000207)).toBeNull();
	});

	it('rejects anything that is not a UIC shaped code', async () => {
		const names = await loadUicStations();
		for (const bad of ['', '801', '801545', '801545800', 'abcdefg', null, undefined]) {
			expect(uicStationName(names, bad), `for ${bad}`).toBeNull();
		}
	});

	it('caches, so the table is only imported once', async () => {
		expect(await loadUicStations()).toBe(await loadUicStations());
	});

	it('lets this repo fill gaps the source leaves', async () => {
		const names = await loadUicStations();
		// the source has the smaller Koblenz and Reutlingen stops but not the
		// two main stations; DB's Muster tickets name both
		expect(names['8019023']).toBeUndefined();
		expect(uicStationName(names, 8019023)).toBe('Koblenz Hbf');
		expect(names['8029309']).toBeUndefined();
		expect(uicStationName(names, 8029309)).toBe('Reutlingen Hbf');
	});

	it('works before the table has loaded, and for codes nobody knows', () => {
		// the card renders before the import resolves
		expect(uicStationName(null, 8718201)).toBeNull();
		// an override still resolves without the table
		expect(uicStationName(null, 8019023)).toBe('Koblenz Hbf');
	});
});

describe('sncfStationName', () => {
	it('resolves mnemonics from the loaded table', async () => {
		const names = await loadSncfStations();
		expect(sncfStationName(names, 'FRPST')).toBe('Paris Gare de l’Est');
		expect(sncfStationName(names, 'FRAEG')).toBe('Strasbourg');
	});

	it('covers stations outside France, which SNCF also sells to', async () => {
		const names = await loadSncfStations();
		expect(sncfStationName(names, 'DEKOH')).toBe('Köln Hbf');
	});

	it('is case and whitespace insensitive, since the field is fixed width', async () => {
		const names = await loadSncfStations();
		expect(sncfStationName(names, ' frpst ')).toBe('Paris Gare de l’Est');
	});

	it('returns null for an empty or unknown mnemonic', async () => {
		const names = await loadSncfStations();
		expect(sncfStationName(names, '')).toBeNull();
		expect(sncfStationName(names, 'ZZZZZ')).toBeNull();
		expect(sncfStationName(null, 'FRPST')).toBeNull();
	});

	it('caches, so the table is only imported once', async () => {
		expect(await loadSncfStations()).toBe(await loadSncfStations());
	});
});

describe('the labels', () => {
	it('fall back to the code as printed on the ticket', () => {
		expect(uicStationLabel(null, 8718201)).toBe('8718201');
		expect(sncfStationLabel(null, 'FRPST')).toBe('FRPST');
	});

	it('stay empty when there is no code at all', () => {
		expect(uicStationLabel(null, null)).toBeNull();
		expect(uicStationLabel(null, '')).toBeNull();
		expect(sncfStationLabel(null, undefined)).toBeNull();
	});
});

describe('isUicCodeTable', () => {
	it('accepts the two UIC tables, and an absent field which defaults to them', () => {
		expect(isUicCodeTable(undefined)).toBe(true);
		expect(isUicCodeTable('stationUIC')).toBe(true);
		expect(isUicCodeTable('stationUICReservation')).toBe(true);
	});

	it('rejects the numberings that only the issuer or carrier can read', () => {
		// same shape of number, a different station: naming these would be wrong
		expect(isUicCodeTable('stationERA')).toBe(false);
		expect(isUicCodeTable('localCarrierStationCodeTable')).toBe(false);
		expect(isUicCodeTable('proprietaryIssuerStationCodeTable')).toBe(false);
	});
});

describe('against the DB Muster specimens', () => {
	const dir = fileURLToPath(new URL('./fixtures/public', import.meta.url));

	/** Every UIC station code the published specimens carry. */
	function fixtureCodes(): string[] {
		if (!existsSync(dir)) return [];
		const codes = new Set<string>();
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.expected.json')) continue;
			const text = readFileSync(join(dir, f), 'utf8');
			for (const m of text.matchAll(/"(?:from|to)Station(?:Num|Uic)":\s*"?(\d{7,8})"?/g)) {
				codes.add(m[1]);
			}
		}
		return [...codes].sort();
	}

	it('names every station they reference', async () => {
		const codes = fixtureCodes();
		if (!codes.length) return; // fixtures not present
		expect(codes.length).toBeGreaterThan(5);
		const names = await loadUicStations();
		const unresolved = codes.filter((c) => uicStationName(names, c) === null);
		expect(unresolved).toEqual([]);
	});
});
