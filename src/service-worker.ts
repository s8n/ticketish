// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
// Offline support: precache the app shell and all built assets (including the
// zxing WASM and pdf.js worker, which Vite emits as hashed assets).
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `ticketish-${version}`;

/**
 * Files in static/ that the host reads as configuration rather than serving.
 * Precaching one is pointless at best: the install is all or nothing, so a
 * host that answers 404 for it would take every update down with it.
 */
const NOT_SERVED = /\/_(headers|redirects|routes\.json)$/;

// prerendered covers the pages beside the shell, such as /credits: an
// attribution page that is only there online is not much of an attribution.
const ASSETS = [
	...build,
	...files.filter((path) => !NOT_SERVED.test(path)),
	...prerendered,
	'/'
];

sw.addEventListener('install', (event) => {
	// No skipWaiting here on purpose. A new worker that takes over mid-session
	// deletes the cache the open page is still importing from, and this app
	// loads tables and the barcode writer late, so the page would start failing
	// at whatever it did next. The new version waits until the reader says so.
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// Which the app does by asking, once it has told them a new version is ready.
sw.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'skip-waiting') sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		caches.match(request).then(
			(cached) =>
				cached ??
				fetch(request).then((response) => {
					// navigations fall back to the cached shell when offline
					return response;
				}).catch(async () => {
					if (request.mode === 'navigate') {
						const shell = await caches.match('/');
						if (shell) return shell;
					}
					throw new Error('offline and not cached');
				})
		)
	);
});
