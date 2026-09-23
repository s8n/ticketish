// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * VDV product names, merged from the vendored tariff data by
 * scripts/build-vdv-products.py. Loaded on demand so the table stays out of
 * the main bundle.
 */
import { lazyTable } from '../lazy.ts';

export const loadVdvProducts = lazyTable(() =>
	import('./products.json').then((m) => (m.default as { products: Record<string, string> }).products)
);

/** Product name for an organisation/product pair, if the table knows it. */
export function vdvProductName(
	products: Record<string, string> | null,
	orgId: number,
	productNumber: number
): string | undefined {
	return products?.[`${orgId}_${productNumber}`];
}
