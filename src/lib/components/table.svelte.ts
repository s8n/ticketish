// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A lookup table for a view, as reactive state that starts empty.
 *
 * Views show codes until the table behind them has loaded and names once it
 * has, so the load is not awaited. It runs while `wanted` says so, which lets
 * a view skip a table its ticket does not use. A load that fails leaves the
 * codes showing, and `lazyTable` forgets the failure so the next view to ask
 * tries again.
 *
 * Call it while a component is being set up, as with any `$effect`.
 */
export function table<T>(
	load: () => Promise<T>,
	wanted: () => unknown = () => true
): { readonly value: T | null } {
	let value = $state<T | null>(null);
	$effect(() => {
		if (value !== null || !wanted()) return;
		load().then(
			(loaded) => (value = loaded),
			() => {}
		);
	});
	return {
		get value() {
			return value;
		}
	};
}
