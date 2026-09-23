// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The list the service worker hands to `cache.addAll`.
 *
 * The install is all or nothing, and `addAll` rejects a list that names the
 * same request twice, so one duplicate means no version ever installs and the
 * app never works offline. SvelteKit lists the prerendered shell as `/` among
 * `prerendered`, and the shell is added here as well so the navigation
 * fallback has it whatever the prerender config says, so the list is
 * deduplicated rather than trusted.
 */

/**
 * Files in static/ that the host reads as configuration rather than serving.
 * Precaching one is pointless at best: a host that answers 404 for it would
 * take every update down with it.
 */
const NOT_SERVED = /\/_(headers|redirects|routes\.json)$/;

export function precacheList(
	build: readonly string[],
	files: readonly string[],
	prerendered: readonly string[],
	shell: string
): string[] {
	// prerendered covers the pages beside the shell, such as /credits: an
	// attribution page that is only there online is not much of an attribution.
	return [
		...new Set([...build, ...files.filter((path) => !NOT_SERVED.test(path)), ...prerendered, shell])
	];
}
