// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Renfe station codes to names.
 *
 * Renfe numbers its own stations rather than using the UIC code, so none of
 * the tables under `data/` reaches these. The whole list is built into
 * stations.json by scripts/build-renfe-stations.py from the "Estaciones.
 * Listado completo" dataset Renfe Operadora publishes at
 * https://data.renfe.com/dataset/estaciones-listado-completo, under Creative
 * Commons Attribution 4.0. The attribution travels with the table: the note is
 * inside the JSON as `_note`, and repeated in the build script and the README
 * credits. Origen de los datos: Renfe Operadora.
 *
 * A thousand names is more than a Spanish ticket's worth for everyone else to
 * carry, so the table loads on demand. Until it arrives the raw code is shown,
 * which is what happened for every station before the table existed.
 *
 * Names are upper case because that is how Renfe issues them and how they are
 * printed on the ticket, so a pass built here reads like the paper it came
 * from. See the build script for why they are not title cased.
 *
 * OVERRIDES take precedence and are the entries where this repo has a better
 * source. Anything added by hand goes there rather than into the JSON, so
 * regenerating stays a clean copy.
 */

interface StationEntry {
	name: string;
	/** Where the identification comes from. */
	source: string;
}

/**
 * Empty, and that is the point: what used to be here was a dozen codes read
 * off tickets and guessed at, most of them wrong. Renfe publishes the table,
 * so a correction now needs a source better than Renfe's own.
 */
const OVERRIDES: Record<string, StationEntry> = {};

export type RenfeStationTable = Record<string, string>;

interface StationFile {
	default: { stations: RenfeStationTable };
}

let cache: RenfeStationTable | null = null;
let pending: Promise<RenfeStationTable> | null = null;

export async function loadRenfeStations(): Promise<RenfeStationTable> {
	if (cache) return cache;
	pending ??= import('./stations.json').then((m) => {
		cache = (m as unknown as StationFile).default.stations;
		return cache;
	});
	return pending;
}

/** Codes are five digits; a barcode pads them and the parser strips that. */
const key = (code: string) => code.padStart(5, '0');

/** The station's name, or null when nothing here knows the code. */
export function renfeStationName(
	names: RenfeStationTable | null,
	code: string | undefined
): string | null {
	if (!code) return null;
	return OVERRIDES[key(code)]?.name ?? names?.[key(code)] ?? null;
}

/** The same, falling back to the code itself so nothing shows as blank. */
export function renfeStationLabel(
	names: RenfeStationTable | null,
	code: string | undefined,
	missing = '?'
): string {
	if (!code) return missing;
	return renfeStationName(names, code) ?? `Station ${code}`;
}
