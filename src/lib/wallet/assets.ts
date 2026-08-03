// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The images every pass carries: the app's own ticket mark, at the sizes
 * Apple asks for.
 *
 * They are imported as URLs and read back with `fetch`, which covers both
 * ways the bundler can treat them. At their current size it inlines them as
 * data URIs, so the images ship inside the precached bundle and the fetch
 * never touches the network; if one ever grows past the inline threshold it
 * becomes a hashed build asset, which the service worker precaches too.
 * Either way a pass can be built offline.
 */
import icon29 from '../assets/pass/icon-29.png?url';
import icon58 from '../assets/pass/icon-58.png?url';
import icon87 from '../assets/pass/icon-87.png?url';
import logo50 from '../assets/pass/logo-50.png?url';
import logo100 from '../assets/pass/logo-100.png?url';
import type { PassAssets } from './pkpass.ts';

/** Pass file name to the asset holding it. */
const SOURCES: Record<string, string> = {
	'icon.png': icon29,
	'icon@2x.png': icon58,
	'icon@3x.png': icon87,
	'logo.png': logo50,
	'logo@2x.png': logo100
};

let cache: PassAssets | null = null;

export async function passAssets(): Promise<PassAssets> {
	if (cache) return cache;
	const entries = await Promise.all(
		Object.entries(SOURCES).map(async ([name, url]) => {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`could not read the pass image ${name}`);
			return [name, new Uint8Array(await response.arrayBuffer())] as const;
		})
	);
	cache = Object.fromEntries(entries);
	return cache;
}
