// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * UK NLC (National Location Code) names, built from the RDG fares feed by
 * scripts/build-nlc-names.py. The table is a few hundred KiB, so it is
 * loaded on demand the first time an RSP6 ticket is displayed.
 */

export interface NlcEntry {
	/** Station or group name */
	n: string;
	/** CRS (3-alpha) code, when the location has one */
	c?: string;
}

let cache: Record<string, NlcEntry> | null = null;
let pending: Promise<Record<string, NlcEntry>> | null = null;

export async function loadNlcNames(): Promise<Record<string, NlcEntry>> {
	if (cache) return cache;
	pending ??= import('./nlc.json').then((m) => {
		cache = m.default as Record<string, NlcEntry>;
		return cache;
	});
	return pending;
}

/** Look up a code in an already-loaded table. NLCs are zero-padded to 4. */
export function nlcEntry(
	names: Record<string, NlcEntry> | null,
	code: string
): NlcEntry | undefined {
	if (!names || !code) return undefined;
	return names[code.padStart(4, '0')];
}

/** Display label for an NLC, falling back to the raw code. */
export function nlcLabel(names: Record<string, NlcEntry> | null, code: string): string {
	const entry = nlcEntry(names, code);
	if (!entry) return code ? `NLC ${code}` : '?';
	return entry.n;
}
