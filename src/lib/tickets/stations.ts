// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Station names for the two identifier spaces that turn up on tickets:
 * seven digit UIC location codes, and the five letter Benerail mnemonics that
 * SNCF e-billets and ELB barcodes carry.
 *
 * Both tables are built by scripts/build-uic-benerail-from-trainline.py from
 * https://github.com/trainline-eu/stations, which is ODbL 1.0. What comes out
 * is a derived database, so the attribution and the licence travel with it:
 * the note is inside each JSON as `_note`, and repeated in the README credits.
 *
 * The UIC codes come from a second source as well. Trainline's list is a
 * distributor's catalogue and covers the countries it sells to, which leaves
 * countries like Poland and Croatia with a small fraction of their stations, so
 * a HŽPP or MÁV ticket would show numbers where names belong. plc-stations.json
 * fills those countries from the UIC
 * Primary Location Code register and is consulted only where the catalogue is
 * silent, so the two never disagree about a station. Read the note at the top
 * of scripts/build-uic-from-plc.py before touching it: its terms are the least
 * settled of anything here.
 *
 * They are large, so they load on demand and separately: an SNCF barcode has
 * no use for the UIC codes and a DB ticket has none for the mnemonics. Until a
 * table arrives the raw code is shown.
 *
 * OVERRIDES take precedence and are the entries where this repo has a better
 * source. Anything added by hand goes there rather than into the JSON, so
 * regenerating stays a clean copy.
 */
import { lazyTable } from './lazy.ts';

interface StationEntry {
	name: string;
	/** Where the identification comes from. */
	source: string;
}

/**
 * Both of these are main stations that the source leaves without a UIC code,
 * even though it has their smaller neighbours (8019013 Koblenz-Lützel,
 * 8029307 Reutlingen-Sondelfingen). DB's published Muster tickets print the
 * name against the code, which settles it.
 */
const UIC_OVERRIDES: Record<string, StationEntry> = {
	'8019023': { name: 'Koblenz Hbf', source: 'DB Muster ticket (Normalpreis)' },
	'8029309': { name: 'Reutlingen Hbf', source: 'DB Muster ticket (FV-Supersparpreis)' }
};

/**
 * Empty. Note that a name from the neighbouring `sncf_id` space is not a
 * source: the two name different stations for hundreds of the same mnemonics
 * (DEFLS is Freilassing in one and Salzburg in the other), which is why this
 * table is built from `benerail_id` in the first place.
 */
const BENERAIL_OVERRIDES: Record<string, StationEntry> = {};

export type StationTable = Record<string, string>;

interface StationFile {
	default: { stations: StationTable };
}

/**
 * Both UIC tables, as one. They are merged rather than consulted in turn
 * because the register only holds codes the catalogue does not, so there is
 * nothing to arbitrate: spreading the catalogue second is belt and braces
 * against a future export overlapping it. The files stay separate on disk,
 * where their notes and their differing terms are.
 */
export const loadUicStations = lazyTable(() =>
	Promise.all([import('./data/plc-stations.json'), import('./data/uic-stations.json')]).then(
		([plc, catalogue]): StationTable => ({
			...(plc as unknown as StationFile).default.stations,
			...(catalogue as unknown as StationFile).default.stations
		})
	)
);

export const loadBenerailStations = lazyTable(() =>
	import('./data/benerail-stations.json').then(
		(m) => (m as unknown as StationFile).default.stations
	)
);

/**
 * The table is keyed by the seven digit code. Tickets also carry the eight
 * digit form, which is the same code plus a check digit, so drop it.
 */
function uicKey(code: number | string): string | null {
	const digits = String(code).trim();
	if (!/^\d+$/.test(digits)) return null;
	if (digits.length === 7) return digits;
	if (digits.length === 8) return digits.slice(0, 7);
	return null;
}

/** Station name for a UIC code, or null when it is unknown. */
export function uicStationName(
	names: StationTable | null,
	code: number | string | null | undefined
): string | null {
	if (code === null || code === undefined || code === '') return null;
	const key = uicKey(code);
	if (!key) return null;
	return UIC_OVERRIDES[key]?.name ?? names?.[key] ?? null;
}

/** Station name for a Benerail mnemonic, or null when it is unknown. */
export function benerailStationName(
	names: StationTable | null,
	code: string | null | undefined
): string | null {
	if (!code) return null;
	const key = code.trim().toUpperCase();
	return BENERAIL_OVERRIDES[key]?.name ?? names?.[key] ?? null;
}

/** The name if it is known, otherwise the code as printed on the ticket. */
export function uicStationLabel(
	names: StationTable | null,
	code: number | string | null | undefined
): string | null {
	if (code === null || code === undefined || code === '') return null;
	return uicStationName(names, code) ?? String(code);
}

/** The name if it is known, otherwise the mnemonic as printed on the ticket. */
export function benerailStationLabel(
	names: StationTable | null,
	code: string | null | undefined
): string | null {
	if (!code) return null;
	return benerailStationName(names, code) ?? code;
}

/**
 * FCB records say which numbering a station code belongs to. Only the UIC
 * tables can be looked up here; a carrier's or issuer's own numbering happens
 * to use the same shape of number and would resolve to the wrong station.
 * The field defaults to stationUIC when absent.
 */
export function isUicCodeTable(table: string | undefined | null): boolean {
	return !table || table === 'stationUIC' || table === 'stationUICReservation';
}
