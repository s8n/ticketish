// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * TCDD station names.
 *
 * The newer barcode layout gives numeric station ids from TCDD's current
 * booking backend; those are built into stations.json by
 * scripts/build-tcdd-stations.py and loaded on demand, since only Turkish
 * tickets need them.
 *
 * Older tickets number stations in a different, 9 digit space belonging to
 * the retired api-yebsp backend, which no longer serves a list. The few names
 * known for it are kept below, each with where it was identified.
 */
import { lazyTable } from '../lazy.ts';

interface StationEntry {
	name: string;
	/** Where the identification comes from. */
	source: string;
}

/**
 * The retired 9 digit id space, as used by the older barcode layout. There is
 * no table to correct, so these are the whole of what is known.
 */
const LEGACY: Record<string, StationEntry> = {
	'234516259': { name: 'Ankara Gar', source: 'printed beside the code on a ticket' },
	'234516104': { name: 'İstanbul (Pendik)', source: 'printed beside the code on a ticket' }
};

/**
 * Corrections to the generated table, for the current id space, each with a
 * source. Empty.
 */
const OVERRIDES: Record<string, StationEntry> = {};

export const loadTcddStations = lazyTable(() =>
	import('./stations.json').then((m) => (m.default as { stations: Record<string, string> }).stations)
);

/** Display label for a station id, falling back to the raw code. */
export function tcddStationName(names: Record<string, string> | null, code: string): string {
	if (!code) return '';
	return OVERRIDES[code]?.name ?? names?.[code] ?? LEGACY[code]?.name ?? `Station ${code}`;
}
