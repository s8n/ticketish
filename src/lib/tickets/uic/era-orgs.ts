// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * ERA Organisation Codes: who a company code on a ticket belongs to.
 *
 * From 1 January 2026 UIC allocates RICS codes only outside the EU, and the
 * European Union Agency for Railways allocates Organisation Codes inside it.
 * The two are one numbering space rather than two: companies that already held
 * a RICS code kept the same value as their Organisation Code, and ERA's own
 * terms say the synchronised management guarantees they stay equal. So this
 * table answers the same question rics.json does, for the whole register
 * rather than a curated handful, which is why `ricsName` falls back to it.
 *
 * A code is four characters. The digits-only ones are the RICS compatible part
 * and the only ones a barcode can carry today; the alphanumeric ones (INML,
 * 4XDU) are ERA allocations that no format here writes yet, and are kept
 * because the register is published as one table.
 *
 * Revoked codes are in here too, since a ticket outlives an allocation: a
 * barcode issued while a code was held still carries it. They carry the date
 * they were revoked on, and `eraOrgLabel` says so where it shows the name.
 * They have no acronym and no country, because the revoked sheet has neither
 * column. Where a code has since been allocated to somebody else, that
 * organisation wins: the name says who holds the code, not who used to.
 *
 * Built by scripts/build-era-orgs.py from the register ERA publishes, and
 * refreshed monthly. It is large, so it loads on demand and callers show the
 * raw code until it lands, the way they did before any table existed.
 *
 * OVERRIDES take precedence and are the entries where this repo has a better
 * source. Anything added by hand goes there rather than into the JSON, so
 * regenerating stays a clean copy. rics.json is not that: it answers after
 * this table rather than over it, for the codes the register does not carry.
 */

import { codeLabel, type OrgEntry } from '../orglabel.ts';

/** One organisation, in the short keys the generated JSON uses. */
export interface EraOrg extends OrgEntry {
	/**
	 * Country, as a two letter code. Absent for a revoked code, since that
	 * sheet has no country column, and for a country the build could not place.
	 */
	c?: string;
}

export type EraOrgTable = Record<string, EraOrg>;

interface OverrideEntry extends EraOrg {
	/** Where the correction comes from. */
	source: string;
}

/** Empty: the register is ERA's own and corrections need a better source. */
const OVERRIDES: Record<string, OverrideEntry> = {};

let cache: EraOrgTable | null = null;
let pending: Promise<EraOrgTable> | null = null;
let edition: string | null = null;

export async function loadEraOrgs(): Promise<EraOrgTable> {
	if (cache) return cache;
	pending ??= import('./era-orgs.json').then((m) => {
		const file = m.default as { _edition: string; orgs: EraOrgTable };
		edition = file._edition;
		cache = file.orgs;
		return cache;
	});
	return pending;
}

/** Which day's export the loaded table came from, once it has loaded. */
export function eraEdition(): string | null {
	return edition;
}

/**
 * A code in the form the register keys on: four characters, upper case, with
 * the leading zeros a numeric code is written with. 80 and "0080" are both
 * DB InfraGO; "inml" is INML.
 */
export function eraCode(code: number | string | null | undefined): string | null {
	if (code === null || code === undefined) return null;
	const text = String(code).trim().toUpperCase();
	if (!text) return null;
	return /^\d+$/.test(text) ? text.padStart(4, '0') : text;
}

/** Look up an organisation in an already-loaded table. */
export function eraOrg(orgs: EraOrgTable | null, code: number | string | null | undefined) {
	const key = eraCode(code);
	if (!key) return null;
	return OVERRIDES[key] ?? orgs?.[key] ?? null;
}

/** The registered name for a code, or null when the table does not have it. */
export function eraOrgName(
	orgs: EraOrgTable | null,
	code: number | string | null | undefined
): string | null {
	return eraOrg(orgs, code)?.n ?? null;
}

/**
 * How an organisation is shown: `orgLabel` decides between the acronym, the
 * registered name and both, which is a question every register with the two
 * asks the same way.
 *
 * A code ERA has revoked says so here rather than in the table, so that the
 * name stays the organisation's name and the reader still learns that the code
 * is no longer anybody's.
 */
export function eraOrgLabel(
	orgs: EraOrgTable | null,
	code: number | string | null | undefined
): string | null {
	const org = eraOrg(orgs, code);
	return org ? codeLabel(org, eraCode(code) ?? '', 'org') : null;
}
