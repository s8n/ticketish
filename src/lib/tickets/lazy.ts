// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A lookup table imported the first time something asks for it.
 *
 * The big tables are dynamic imports so only the tickets that need one pay for
 * it, and every caller asking at once shares one import. A failed import is
 * forgotten rather than kept: the chunk is precached, so a failure is a
 * passing one (an update mid-session, a worker that was not ready), and
 * holding on to it would leave the names out until the page was reloaded.
 */
export function lazyTable<T>(load: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | null = null;
	return () => {
		pending ??= load().catch((error: unknown) => {
			pending = null;
			throw error;
		});
		return pending;
	};
}
