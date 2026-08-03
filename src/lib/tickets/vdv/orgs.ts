// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * VDV organisation names.
 *
 * The bulk of the table is orgs.json, about two thousand organisation IDs
 * compiled by the KCD+eTicketinfo Android app and used here with attribution.
 * That app's licence applies to it: this is a free tool for rail enthusiasts,
 * and the table is not public-domain reference data and is not cleared for
 * commercial reuse. See scripts/build-vdv-orgs.py for the full note.
 *
 * OVERRIDES below take precedence, and are the entries where this repo has
 * either a better source or a correction. Anything added by hand goes there
 * rather than into orgs.json, so regenerating stays a clean copy.
 *
 * The table is large, so it loads on demand: only VDV tickets pay for it, and
 * until it arrives the numeric ID is shown, which is what happened for every
 * organisation before the table existed.
 */

interface OrgEntry {
	name: string;
	/** Where the identification comes from. */
	source: string;
}

const OVERRIDES: Record<number, OrgEntry> = {
	// The NRW tariff specification published by KC Digitalisierung names this
	// one outright: "KCM (6212 dezimal)". The eTicketInfo table disagrees and
	// calls it Verkehrsverbund Rhein-Sieg GmbH, the same name it gives 102.
	// Going with the citable source.
	6212: { name: 'Kompetenzcenter Marketing NRW (KCM)', source: 'KCD NRW tariff specification' },

	// eTicketInfo has "Münchner Verkehrgesellschaft mbH", missing the s.
	6292: { name: 'Münchner Verkehrsgesellschaft (MVG)', source: 'MVG ticket samples' }
};

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

export async function loadVdvOrgs(): Promise<Record<string, string>> {
	if (cache) return cache;
	pending ??= import('./orgs.json').then((m) => {
		cache = (m.default as { orgs: Record<string, string> }).orgs;
		return cache;
	});
	return pending;
}

export function vdvOrgName(
	orgs: Record<string, string> | null,
	code: number | undefined | null
): string | null {
	if (code === undefined || code === null) return null;
	return OVERRIDES[code]?.name ?? orgs?.[String(code)] ?? null;
}

/** Name plus the numeric ID, or just the ID when the name is unknown. */
export function vdvOrgLabel(
	orgs: Record<string, string> | null,
	code: number | undefined | null
): string {
	if (code === undefined || code === null) return 'unknown';
	const name = vdvOrgName(orgs, code);
	return name ? `${name} (${code})` : `org ${code}`;
}

export function vdvOrgSource(code: number): string {
	return OVERRIDES[code]?.source ?? 'eTicketInfo organisation table';
}
