// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * How an organisation is written when a register gives both a name and an
 * acronym. Shared, because every register that has the two has the same
 * problem with them.
 *
 * The acronym leads, since that is what an operator is spoken about as (HVV,
 * GYSEV, ADIF) where the registered name is how it signs contracts. Where a
 * register has no acronym the name stands alone.
 *
 * Plenty of what registers file as an acronym is not one: it is the name again
 * without its legal form, or with the punctuation moved. Saying "DB
 * Fernverkehr (DB Fernverkehr AG)" says nothing twice, so where one is inside
 * the other only the longer of the two is shown, and the name wins when they
 * are the same words.
 */

/**
 * Letters and digits only, so "SNCF-Voyageurs" and "SNCF Voyageurs" meet.
 *
 * Every script's letters, not a-z: the registers hold Cyrillic, Greek and
 * Turkish names, and an ASCII class would erase them to nothing and then find
 * that nothing inside every acronym. Lower casing comes first so that the dot
 * Turkish İ lowercases into is there to be stripped as the diacritic it is.
 */
const plain = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^\p{L}\p{N}]/gu, '');

export function orgLabel(name: string, acronym?: string | null): string {
	if (!acronym) return name;
	const plainName = plain(name);
	const plainAcronym = plain(acronym);
	// A side with no letters in it would be found inside anything, so compare
	// only when both have something to compare, and never drop the name.
	if (!plainAcronym) return name;
	if (plainName && plainName.includes(plainAcronym)) return name;
	if (plainName && plainAcronym.includes(plainName)) return acronym;
	return `${acronym} (${name})`;
}

/** What every register's table holds about the organisation behind a code. */
export interface OrgEntry {
	/** Name, as the register gives it. */
	n: string;
	/** Acronym, where the register has one that is not the name. */
	a?: string;
	/**
	 * The date the code was taken back on. A register that revokes a code has
	 * already done it, so this shows whatever the day is. An empty string is
	 * still a revocation, for a register that gives no usable date.
	 */
	revoked?: string;
	/**
	 * The last day the code is valid. This one is a date to compare against,
	 * since a register can give an end of validity that has not arrived yet.
	 */
	until?: string;
}

/**
 * An organisation as a reader should see it: the name and acronym, and where
 * the code is no longer the organisation's, that it is not and since when.
 *
 * `kind` is what the register calls its numbering, so the reader is told which
 * code has lapsed rather than being left to guess: "RICS", "org", "GO-Nr.".
 * An entry with both dates says both things, which is two facts rather than a
 * contradiction: a code can be given back and then run out of validity.
 */
export function codeLabel(
	org: OrgEntry,
	code: string | number,
	kind: string,
	today: Date = new Date()
): string {
	let label = orgLabel(org.n, org.a);
	if (org.revoked !== undefined) {
		label += ` (Revoked${org.revoked ? ` ${org.revoked}` : ''}, ${kind} ${code})`;
	}
	// The last day of validity is still a day of validity.
	if (org.until && org.until < today.toISOString().slice(0, 10)) {
		label += ` (Expired ${org.until}, ${kind} ${code})`;
	}
	return label;
}
