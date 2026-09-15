// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

import { execSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * What the app calls this build, which is also what the service worker names
 * its cache after, so it has to change whenever the deployed files do.
 *
 * The commit says what is in the build and the stamp says when it was made:
 * neither alone answers a report from somebody running an installed copy. The
 * stamp is UTC so that two machines building the same commit at the same
 * moment agree, and the commit is "unknown" where there is no git to ask,
 * which is a tarball or a container without it.
 *
 * Answered once per process and read back after that, because `vite build`
 * loads this config four times: the analysis pass, the server pass, the client
 * pass and the service worker. Asking the clock again each time means a build
 * that crosses a minute boundary gets two versions, and the two do not stay in
 * their own halves of the output: the version names the payload global, so the
 * shell would set `__sveltekit_<one hash>` while the client runtime reads
 * `__sveltekit_<the other>` and the app throws before it hydrates.
 */
const VERSION_VAR = 'TICKETISH_BUILD_VERSION';

function buildVersion(): string {
	const already = process.env[VERSION_VAR];
	if (already) return already;

	const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
	let sha = 'unknown';
	try {
		sha =
			execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
				.toString()
				.trim() || 'unknown';
	} catch {
		// no git here, and a build without a commit is still a build
	}

	const version = `v${stamp}-${sha}`;
	process.env[VERSION_VAR] = version;
	return version;
}

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),
			version: { name: buildVersion() }
		})
	],
	test: {
		include: ['tests/**/*.test.ts']
	}
});
