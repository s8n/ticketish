// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * VDV product names, merged from the vendored tariff data by
 * scripts/build-vdv-products.py. Loaded on demand so the table stays out of
 * the main bundle.
 */

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

export async function loadVdvProducts(): Promise<Record<string, string>> {
	if (cache) return cache;
	pending ??= import('./products.json').then((m) => {
		cache = m.default as Record<string, string>;
		return cache;
	});
	return pending;
}

/** Product name for an organisation/product pair, if the table knows it. */
export function vdvProductName(
	products: Record<string, string> | null,
	orgId: number,
	productNumber: number
): string | undefined {
	return products?.[`${orgId}_${productNumber}`];
}
