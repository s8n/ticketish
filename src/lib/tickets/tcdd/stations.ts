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
 * known for it are kept below.
 */

/** Retired 9 digit id space, as used by the older barcode layout. */
const LEGACY: Record<string, string> = {
	'234516259': 'Ankara Gar',
	'234516104': 'İstanbul (Pendik)'
};

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

export async function loadTcddStations(): Promise<Record<string, string>> {
	if (cache) return cache;
	pending ??= import('./stations.json').then((m) => {
		cache = m.default as Record<string, string>;
		return cache;
	});
	return pending;
}

/** Display label for a station id, falling back to the raw code. */
export function tcddStationName(names: Record<string, string> | null, code: string): string {
	if (!code) return '';
	return names?.[code] ?? LEGACY[code] ?? `Station ${code}`;
}
