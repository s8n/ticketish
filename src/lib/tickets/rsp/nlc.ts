// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * UK NLC (National Location Code) names, built from the RDG fares feed by
 * scripts/build-nlc-names.py. The table is large, so it is loaded on demand
 * the first time an RSP6 ticket is displayed.
 */
import { lazyTable } from '../lazy.ts';

export interface NlcEntry {
	/** Station or group name */
	n: string;
	/** CRS (3-alpha) code, when the location has one */
	c?: string;
}

export const loadNlcNames = lazyTable(() =>
	import('./nlc.json').then((m) => (m.default as { names: Record<string, NlcEntry> }).names)
);

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
