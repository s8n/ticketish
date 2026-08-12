// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Swiss Geschäftsorganisation numbers: who sold a NOVA ticket, and whose zones
 * it is valid in.
 *
 * The numbers are the sector's own, kept in atlas and published as open data
 * by the Geschäftsstelle SKI. scripts/build-nova-orgs.py builds the table and a
 * monthly workflow refreshes it, which the terms of use ask for as much as they
 * ask for the credit. It is large, so it loads on demand and callers show the
 * raw number until it lands.
 *
 * A number outlives the organisation that held it, so entries carry the end of
 * validity where the register gives one and `novaOrgLabel` says so at the point
 * of display. That is decided when a ticket is read rather than when the table
 * is built, because a number expires on a date rather than at a rebuild.
 *
 * OVERRIDES take precedence and are the entries where this repo has a better
 * source. Anything added by hand goes there rather than into the JSON, so
 * regenerating stays a clean copy.
 */
import { codeLabel, type OrgEntry } from '../orglabel.ts';

/**
 * One organisation, in the short keys the generated JSON uses. `until` is the
 * end of validity, for a number the register has not left open-ended.
 */
export type NovaOrg = OrgEntry;

export type NovaOrgTable = Record<string, NovaOrg>;

interface OverrideEntry extends NovaOrg {
	/** Where the correction comes from. */
	source: string;
}

/** Empty: the register is the sector's own and corrections need a source. */
const OVERRIDES: Record<string, OverrideEntry> = {};

let cache: NovaOrgTable | null = null;
let pending: Promise<NovaOrgTable> | null = null;

export async function loadNovaOrgs(): Promise<NovaOrgTable> {
	if (cache) return cache;
	pending ??= import('./orgs.json').then((m) => {
		cache = (m.default as { orgs: NovaOrgTable }).orgs;
		return cache;
	});
	return pending;
}

/**
 * A number in the form the register keys on: decimal, without the padding a
 * ticket or an older table may write it with. 11 and "011" are both SBB.
 */
export function novaOrgCode(code: number | string | null | undefined): string | null {
	if (code === null || code === undefined) return null;
	const text = String(code).trim();
	return /^\d+$/.test(text) ? String(Number(text)) : null;
}

/** Look up an organisation in an already-loaded table. */
export function novaOrg(orgs: NovaOrgTable | null, code: number | string | null | undefined) {
	const key = novaOrgCode(code);
	if (!key) return null;
	return OVERRIDES[key] ?? orgs?.[key] ?? null;
}

/**
 * How an organisation is shown: the acronym and the name as `orgLabel` decides
 * between them, and where the number has lapsed, that it has and when.
 *
 * A NOVA ticket can be years old, and an organisation that no longer holds its
 * number is a different statement from one that does. Saying which is a fact
 * about the day the ticket is read, so the date comes in rather than being
 * baked into the table.
 */
export function novaOrgLabel(
	orgs: NovaOrgTable | null,
	code: number | string | null | undefined,
	today: Date = new Date()
): string | null {
	const org = novaOrg(orgs, code);
	return org ? codeLabel(org, novaOrgCode(code) ?? '', 'GO-Nr.', today) : null;
}
