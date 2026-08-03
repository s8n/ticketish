// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * RICS company codes to issuer display names.
 *
 * The table lives in rics.json, which is hand curated rather than generated:
 * it is a small subset of the RICS register covering the issuers that turn up
 * on tickets, not the whole thing. Add codes there.
 *
 * Unlike the larger tables in this repo (VDV products, TCDD stations) this one
 * is imported statically rather than on demand. It is a few dozen entries, and
 * issuer names are wanted synchronously while a card renders, so loading it
 * lazily would push an await into every caller for no real saving.
 */
import ricsNames from './rics.json' with { type: 'json' };

const RICS: Record<string, string> = ricsNames;

export function ricsName(code: number | string | null | undefined): string | null {
	if (code === null || code === undefined) return null;
	const n = typeof code === 'string' ? parseInt(code, 10) : code;
	// keys are the decimal codes, so "0080" and 80 both land on "80"
	return Number.isFinite(n) ? (RICS[String(n)] ?? null) : null;
}
