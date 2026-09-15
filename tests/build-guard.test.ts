// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A built site has to agree with itself about which build it is.
 *
 * The version string names the payload global: the shell assigns
 * `globalThis.__sveltekit_<hash of the version>` and the client runtime reads
 * it back by the same name. Two versions in one build means the runtime looks
 * for a global nobody set, and the app throws before it hydrates, which is a
 * blank page for everyone who loads it. Nothing else in the output points at
 * the mismatch, so check it here.
 *
 * Skips where there is no build to look at, so `vitest` on a fresh checkout
 * stays useful.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = fileURLToPath(new URL('../build', import.meta.url));
const PAYLOAD_GLOBAL = /__sveltekit_[0-9a-z]+/g;
const VERSION_STAMP = /v\d{12}-[0-9a-z]+/g;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

describe.skipIf(!existsSync(join(BUILD, 'index.html')))('built site', () => {
	it('names one payload global throughout', () => {
		const names = new Map<string, Set<string>>();
		for (const path of walk(BUILD)) {
			if (!/\.(html|js|mjs)$/.test(path)) continue;
			for (const name of readFileSync(path, 'utf8').match(PAYLOAD_GLOBAL) ?? []) {
				const seen = names.get(name) ?? new Set<string>();
				names.set(name, seen.add(path.slice(BUILD.length + 1)));
			}
		}
		const found = [...names].map(([name, paths]) => `${name} in ${[...paths].join(', ')}`);
		expect(names.size, `payload globals found: ${found.join('; ')}`).toBe(1);
	});

	it('stamps the same version on the manifest and the service worker', () => {
		const { version } = JSON.parse(readFileSync(join(BUILD, '_app/version.json'), 'utf8'));
		expect(version).toBeTruthy();
		const worker = readFileSync(join(BUILD, 'service-worker.js'), 'utf8');
		expect([...new Set(worker.match(VERSION_STAMP) ?? [])]).toEqual([version]);
	});
});
