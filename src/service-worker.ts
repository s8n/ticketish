// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
// Offline support: precache the app shell and all built assets (including the
// zxing WASM and pdf.js worker, which Vite emits as hashed assets).
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `ticketish-${version}`;
// prerendered covers the pages beside the shell, such as /credits: an
// attribution page that is only there online is not much of an attribution.
const ASSETS = [...build, ...files, ...prerendered, '/'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
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
