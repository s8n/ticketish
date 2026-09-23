<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * The form that takes a signing identity for one wallet: Apple's pass
	 * certificate and key, or a Google service account and issuer ID.
	 *
	 * What is typed or picked here is held only while the form is open, so
	 * closing it, saved or not, drops the key material with the component.
	 * Saving hands the identity to `credentials`, which keeps it as a
	 * non-extractable key for as long as the reader asks it to.
	 */
	import { loadGoogleIssuer } from '../wallet/google.ts';
	import { loadIdentity } from '../wallet/identity.ts';
	import { credentials } from '../wallet/credentials.svelte.ts';

	let {
		kind,
		onsaved,
		oncancel
	}: {
		kind: 'apple' | 'google';
		/** Called once the identity is stored, to carry on with the export. */
		onsaved: () => void | Promise<void>;
		oncancel: () => void;
	} = $props();

	const say = (e: unknown) => (e instanceof Error ? e.message : String(e));

	let certText = $state('');
	let keyText = $state('');
	let serviceAccountText = $state('');
	let issuerId = $state('');
	let setupError = $state<string | null>(null);

	async function readFile(event: Event): Promise<string> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		return file ? await file.text() : '';
	}

	async function saveApple() {
		setupError = null;
		try {
			await credentials.setApple(await loadIdentity(certText, keyText));
			certText = keyText = '';
			await onsaved();
		} catch (e) {
			setupError = say(e);
		}
	}

	async function saveGoogle() {
		setupError = null;
		try {
			await credentials.setGoogle(await loadGoogleIssuer(serviceAccountText, issuerId));
			serviceAccountText = '';
			await onsaved();
		} catch (e) {
			setupError = say(e);
		}
	}
</script>

{#if kind === 'apple'}
	<section class="setup">
		<h4>Apple pass signing certificate</h4>
		<p class="note">
			From your Apple Developer account: a Pass Type ID certificate and its private key, as PEM.
			If you have the .p12 that Keychain exports, split it first:
		</p>
		<pre><code
				>openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out key.pem</code
			></pre>
		<p class="note">
			On OpenSSL 3, add <code>-legacy</code> after <code>pkcs12</code> if it reports an unsupported
			algorithm: Keychain still encrypts with one OpenSSL 3 keeps behind that flag. The openssl on
			macOS is LibreSSL, which reads the file as it is and does not know the flag.
		</p>
		<label>
			Certificate (cert.pem)
			<input type="file" accept=".pem,.cer,.crt" onchange={async (e) => (certText = await readFile(e))} />
		</label>
		<label>
			Private key (key.pem)
			<input type="file" accept=".pem,.key" onchange={async (e) => (keyText = await readFile(e))} />
		</label>
		{#if setupError}<p class="note warn">{setupError}</p>{/if}
		<div class="actions">
			<button onclick={saveApple} disabled={!certText || !keyText}>Use this certificate</button>
			<button onclick={oncancel}>Cancel</button>
		</div>
		<p class="note">
			Neither file is uploaded anywhere. The key is imported so the browser can sign with it and
			cannot export it again.
		</p>
	</section>
{:else}
	<section class="setup">
		<h4>Google Wallet issuer</h4>
		<p class="note">
			Two things, from two consoles. The issuer ID is in the
			<a href="https://pay.google.com/business/console/" target="_blank" rel="noreferrer noopener"
				>Google Pay and Wallet console</a
			>, under Google Wallet API. The key is a service account JSON key from the Google Cloud
			console, IAM and Admin, Service Accounts, Keys, Add key, JSON.
		</p>
		<p class="note">
			The service account also has to be invited into the issuer: Users, Invite a user, its
			email address, access level Developer. Without that, Google refuses a pass it signed.
			An issuer that has not been published only saves passes for accounts registered on it
			as testers.
		</p>
		<label>
			Issuer ID
			<input type="text" inputmode="numeric" bind:value={issuerId} placeholder="3388000000022000000" />
		</label>
		<label>
			Service account key (JSON)
			<input type="file" accept=".json" onchange={async (e) => (serviceAccountText = await readFile(e))} />
		</label>
		{#if setupError}<p class="note warn">{setupError}</p>{/if}
		<div class="actions">
			<button onclick={saveGoogle} disabled={!serviceAccountText || !issuerId}>Use this issuer</button>
			<button onclick={oncancel}>Cancel</button>
		</div>
	</section>
{/if}

<style>
	.setup {
		border-top: 1px dashed var(--paper-edge);
		margin-top: 0.9rem;
		padding-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h4 {
		margin: 0;
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	button {
		font-size: 0.82rem;
		padding: 0.35rem 0.9rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	pre {
		margin: 0;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		background: rgba(38, 50, 75, 0.06);
		padding: 0.5rem 0.6rem;
		border-radius: 6px;
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.95em;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	input[type='text'] {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		background: transparent;
		color: var(--ink);
	}
</style>
