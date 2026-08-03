// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The signing credentials the wallet exports need, and the only thing in this
 * app that is ever written to disk.
 *
 * Everything else here is deliberately transient: the ticket store keeps
 * tickets in memory and forgets them on reload, because a scanned ticket is
 * somebody's travel. A signing key is different. It is not the reader's
 * itinerary, it is their tooling, and re-importing two PEM files for every
 * pass would be enough friction to make the feature not worth using.
 *
 * So it can be remembered, but only when asked. Off by default, one switch,
 * and what gets stored is a `CryptoKey` imported as non-extractable: the
 * browser will sign with it and will not hand the bytes back, to this app or
 * to anything else that reaches the same database. Forgetting deletes the
 * whole database rather than the records in it.
 */
import { identityFrom, type SigningIdentity } from './identity.ts';
import type { GoogleIssuer } from './google.ts';

const DB_NAME = 'ticketish-wallet';
const STORE = 'credentials';

interface StoredApple {
	certificate: Uint8Array;
	key: CryptoKey;
}

interface StoredGoogle {
	issuerId: string;
	serviceAccountEmail: string;
	key: CryptoKey;
}

const available = () => typeof indexedDB !== 'undefined';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('could not open the database'));
	});
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		openDb().then((db) => {
			const request = run(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => {
				resolve(request.result);
				db.close();
			};
			request.onerror = () => {
				reject(request.error ?? new Error('the database refused the write'));
				db.close();
			};
		}, reject);
	});
}

function deleteDb(): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = request.onerror = request.onblocked = () => resolve();
	});
}

class WalletCredentials {
	apple = $state<SigningIdentity | null>(null);
	google = $state<GoogleIssuer | null>(null);
	/** Whether what is loaded should outlive this tab. */
	remember = $state(false);
	/** True once a restore has been attempted, so the UI can stop guessing. */
	restored = $state(false);

	/** Bring back anything a previous session was asked to remember. */
	async restore(): Promise<void> {
		if (!available()) {
			this.restored = true;
			return;
		}
		try {
			const [apple, google] = await Promise.all([
				transact<StoredApple | undefined>('readonly', (s) => s.get('apple')),
				transact<StoredGoogle | undefined>('readonly', (s) => s.get('google'))
			]);
			if (apple) this.apple = identityFrom(apple.certificate, apple.key);
			if (google) this.google = { ...google };
			this.remember = !!(apple || google);
		} catch {
			// a browser with storage switched off is a browser that just does not
			// remember; it is not a reason to fail the feature
		}
		this.restored = true;
	}

	setApple(identity: SigningIdentity | null): Promise<void> {
		this.apple = identity;
		return this.persist();
	}

	setGoogle(issuer: GoogleIssuer | null): Promise<void> {
		this.google = issuer;
		return this.persist();
	}

	/** Turn remembering on or off, writing or wiping to match. */
	async setRemember(on: boolean): Promise<void> {
		this.remember = on;
		await this.persist();
	}

	private async persist(): Promise<void> {
		if (!available()) return;
		if (!this.remember) {
			await deleteDb();
			return;
		}
		try {
			if (this.apple) {
				const record: StoredApple = {
					certificate: this.apple.signer.certificate,
					key: this.apple.signer.key
				};
				await transact('readwrite', (s) => s.put(record, 'apple'));
			} else {
				await transact('readwrite', (s) => s.delete('apple'));
			}
			if (this.google) {
				const record: StoredGoogle = {
					issuerId: this.google.issuerId,
					serviceAccountEmail: this.google.serviceAccountEmail,
					key: this.google.key
				};
				await transact('readwrite', (s) => s.put(record, 'google'));
			} else {
				await transact('readwrite', (s) => s.delete('google'));
			}
		} catch {
			// same as restore: storage that will not take it is not fatal
		}
	}

	/** Drop everything, from memory and from disk. */
	async forget(): Promise<void> {
		this.apple = null;
		this.google = null;
		this.remember = false;
		if (available()) await deleteDb();
	}
}

export const credentials = new WalletCredentials();
