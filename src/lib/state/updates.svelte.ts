// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Whether a newer build of the app is sitting on the device, and applying it
 * when the reader says so.
 *
 * An installed PWA can run the same build for months: the browser looks for a
 * new service worker on navigation, and somebody who never closes the app never
 * navigates. So this asks outright, when the page loads and whenever it comes
 * back to the foreground.
 *
 * Nothing reloads on its own. Scanned tickets live in memory and nowhere else,
 * so pulling the page out from under somebody reading one would lose it. The
 * app says a new version is ready and waits to be told.
 */

/** Long enough that switching tabs does not hammer the network. */
const CHECK_EVERY = 15 * 60 * 1000;

class Updates {
	/** A new version is installed and waiting for the word. */
	ready = $state(false);
	/** A check is in flight, so the UI can say so rather than look inert. */
	checking = $state(false);
	/**
	 * Set for a moment after a check somebody asked for that found nothing.
	 * Tapping something that answers with silence reads as a broken control.
	 */
	upToDate = $state(false);

	#registration: ServiceWorkerRegistration | null = null;
	#lastCheck = 0;
	#applying = false;

	/** Call once, from the page. Does nothing where there is no worker. */
	async start(): Promise<void> {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration) return;
		this.#registration = registration;
		this.ready = !!registration.waiting;

		// A worker that finishes installing while the page is open is the same
		// news as one that was already waiting when it opened.
		registration.addEventListener('updatefound', () => {
			const installing = registration.installing;
			if (!installing) return;
			installing.addEventListener('statechange', () => {
				// Without a controller this is the first install rather than an
				// update, and there is nothing for the reader to decide.
				if (installing.state === 'installed' && navigator.serviceWorker.controller) {
					this.ready = true;
				}
			});
		});

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') this.check();
		});
		await this.check();
	}

	/** Ask the browser whether a newer worker is published. */
	async check(force = false): Promise<void> {
		const registration = this.#registration;
		if (!registration || this.checking) return;
		if (!force && Date.now() - this.#lastCheck < CHECK_EVERY) return;
		this.#lastCheck = Date.now();
		this.checking = true;
		try {
			await registration.update();
			this.ready = this.ready || !!registration.waiting;
		} catch {
			// offline, or the check failed: the app is running either way
		} finally {
			this.checking = false;
			if (force && !this.ready) {
				this.upToDate = true;
				setTimeout(() => (this.upToDate = false), 4000);
			}
		}
	}

	/** Hand over to the waiting version and reload onto it. */
	apply(): void {
		const waiting = this.#registration?.waiting;
		if (!waiting || this.#applying) return;
		this.#applying = true;
		// The reload waits for the new worker to take over, so that the page
		// comes back on the new cache rather than racing it.
		navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
			once: true
		});
		waiting.postMessage({ type: 'skip-waiting' });
	}
}

export const updates = new Updates();
