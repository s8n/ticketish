// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Company codes on a ticket to the issuer's name.
 *
 * Two tables answer between them, because two bodies allocate the codes. ERA's
 * Organisation Code register covers the EU, and rics.json holds the codes UIC
 * allocates outside it. See era-orgs.ts for why the two are one numbering
 * space.
 *
 * Both are built from ERA's export, which marks every row as one or the other,
 * so the split is the register's own rather than a guess made here.
 * scripts/rics-era-overrides.json goes on top at build time, for
 * a code ERA does not mirror or gets wrong; that is where a hand kept entry
 * belongs, not in the generated file.
 *
 * That arrangement is a snapshot rather than a guarantee. ERA currently mirrors
 * the allocations it did not make, and whether it goes on doing so after the
 * transition period is not settled anywhere: the railways outside the EU are
 * where the two registers would drift apart first, and this file is what would
 * carry them when they do.
 *
 * Both load on demand. A caller loads them together with `loadIssuerNames` and
 * passes the result in; one that has not shows the raw code, the way every
 * caller did before either table existed. That keeps the lookup synchronous
 * inside markup, where most of the call sites are.
 */
import { eraCode, eraOrgLabel, loadEraOrgs, type EraOrgTable } from './era-orgs.ts';
import { codeLabel, type OrgEntry } from '../orglabel.ts';

/**
 * RICS codes to the organisations that hold them, keyed by the decimal code as
 * a string. The same shape the other registers' tables use, so a code that has
 * been given back reads the same wherever the answer came from.
 */
export type RicsTable = Record<string, OrgEntry>;

/** The tables a name can come from, each null until it loads. */
export interface IssuerTables {
	/** ERA's register: the EU allocations, and the non-EU ones it mirrors. */
	era: EraOrgTable | null;
	/** RICS, for the codes outside the EU that the register does not reach. */
	rics: RicsTable | null;
}

let cache: RicsTable | null = null;
let pending: Promise<RicsTable> | null = null;

export async function loadRicsNames(): Promise<RicsTable> {
	if (cache) return cache;
	pending ??= import('./rics.json').then((m) => {
		cache = (m.default as { orgs: RicsTable }).orgs;
		return cache;
	});
	return pending;
}

/** Both tables, for the callers that name an issuer by its code. */
export async function loadIssuerNames(): Promise<IssuerTables> {
	const [era, rics] = await Promise.all([loadEraOrgs(), loadRicsNames()]);
	return { era, rics };
}

export function ricsName(
	code: number | string | null | undefined,
	names: IssuerTables | null = null
): string | null {
	if (code === null || code === undefined) return null;
	const n = typeof code === 'string' ? parseInt(code, 10) : code;
	if (!Number.isFinite(n)) return null;
	// Both tables come out of the same export and are keyed the way the
	// register writes a code, so 80 and "0080" both land on "0080".
	const key = eraCode(n);
	const own = key ? names?.rics?.[key] : undefined;
	return eraOrgLabel(names?.era ?? null, n) ?? (own && key ? codeLabel(own, key, 'RICS') : null);
}
