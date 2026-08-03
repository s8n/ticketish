<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * Putting a ticket into a phone wallet, for the formats this app has an
	 * intentional mapping for. Shown under the barcode tab, since a pass is the
	 * same payload in a different container rather than a reading of it.
	 *
	 * The section only exists at all when `hasMapping` says so, and each button
	 * either works or says why it does not. What it must never do is produce a
	 * pass with a barcode that will not scan, so the two refusals - a symbology
	 * the platform cannot draw, and a binary payload Google cannot carry - are
	 * shown in place of the button rather than discovered at a barrier.
	 */
	import type { ParsedTicket } from '../tickets/types.ts';
	import { hasMapping, previewFields, tripFor, type TripSummary } from '../wallet/trip.ts';
	import { barcodeProblem, buildPkpass, pkpassFileName, PKPASS_MIME } from '../wallet/pkpass.ts';
	import {
		googleCaveats,
		googleProblem,
		buildSaveLink,
		loadGoogleIssuer,
		GOOGLE_EXPORT_ENABLED as SHOW_GOOGLE
	} from '../wallet/google.ts';
	import { identityProblem, loadIdentity } from '../wallet/identity.ts';
	import { credentials } from '../wallet/credentials.svelte.ts';
	import { passAssets } from '../wallet/assets.ts';

	let { ticket }: { ticket: ParsedTicket } = $props();

	const mapped = $derived(hasMapping(ticket.container));

	let trip = $state<TripSummary | null>(null);
	let loading = $state(true);

	$effect(() => {
		const current = ticket;
		if (!mapped) {
			loading = false;
			return;
		}
		let live = true;
		loading = true;
		tripFor(current)
			.then((t) => live && ((trip = t), (loading = false)))
			.catch(() => live && ((trip = null), (loading = false)));
		return () => {
			live = false;
		};
	});

	const appleBlocked = $derived(barcodeProblem(ticket.symbology));
	const googleBlocked = $derived(googleProblem(ticket.raw, ticket.symbology));
	/** What could go wrong with a Google pass even though it can be built. */
	const googleWarnings = $derived(googleCaveats(ticket.raw));
	const googleHeld = $derived(SHOW_GOOGLE && !!credentials.google);

	let busy = $state(false);
	let error = $state<string | null>(null);
	let saveLink = $state<string | null>(null);
	let linkWarnings = $state<string[]>([]);
	/** Which credential form is open, if any. */
	let setup = $state<'apple' | 'google' | null>(null);

	const say = (e: unknown) => (e instanceof Error ? e.message : String(e));

	async function exportApple() {
		error = null;
		if (!credentials.apple) {
			setup = 'apple';
			return;
		}
		const problem = identityProblem(credentials.apple);
		if (problem) {
			error = problem;
			return;
		}
		if (!trip || !ticket.symbology) return;
		busy = true;
		try {
			const bytes = await buildPkpass({
				trip,
				payload: ticket.raw,
				symbology: ticket.symbology,
				identity: credentials.apple,
				assets: await passAssets()
			});
			const url = URL.createObjectURL(
				new Blob([bytes as unknown as BlobPart], { type: PKPASS_MIME })
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = pkpassFileName(trip);
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch (e) {
			error = say(e);
		} finally {
			busy = false;
		}
	}

	async function exportGoogle() {
		error = null;
		saveLink = null;
		linkWarnings = [];
		if (!credentials.google) {
			setup = 'google';
			return;
		}
		if (!trip || !ticket.symbology) return;
		busy = true;
		try {
			const link = await buildSaveLink(
				trip,
				ticket.raw,
				ticket.symbology,
				credentials.google,
				location.origin
			);
			saveLink = link.url;
			linkWarnings = link.warnings;
		} catch (e) {
			error = say(e);
		} finally {
			busy = false;
		}
	}

	// ------------------------------------------------------- credentials ---

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
			setup = null;
			await exportApple();
		} catch (e) {
			setupError = say(e);
		}
	}

	async function saveGoogle() {
		setupError = null;
		try {
			await credentials.setGoogle(await loadGoogleIssuer(serviceAccountText, issuerId));
			serviceAccountText = '';
			setup = null;
			await exportGoogle();
		} catch (e) {
			setupError = say(e);
		}
	}

	const previewRows = $derived(trip ? previewFields(trip) : []);
</script>

{#if mapped}
	<section class="wallet">
		<h3>Add to a phone wallet</h3>

		{#if loading}
			<p class="note">Reading the ticket…</p>
		{:else if !trip}
			<p class="note">
				This ticket did not carry enough mapped detail to fill a pass, so there is nothing worth
				writing one from.
			</p>
		{:else}
			<div class="actions">
				<button onclick={exportApple} disabled={busy || !!appleBlocked}>
					{credentials.apple ? 'Add to Apple Wallet' : 'Add to Apple Wallet…'}
				</button>
				{#if SHOW_GOOGLE}
					<button onclick={exportGoogle} disabled={busy || !!googleBlocked}>
						{credentials.google ? 'Add to Google Wallet' : 'Add to Google Wallet…'}
					</button>
				{/if}
			</div>

			{#if appleBlocked}
				<p class="note">Apple Wallet: {appleBlocked}.</p>
			{/if}
			{#if SHOW_GOOGLE && googleBlocked}
				<p class="note">Google Wallet: {googleBlocked}.</p>
			{:else if SHOW_GOOGLE && googleWarnings.length}
				<p class="note">Google Wallet may not work for this ticket: {googleWarnings[0]}</p>
			{/if}
			{#if error}
				<p class="note warn">{error}</p>
			{/if}

			{#if saveLink}
				<p class="note">
					The pass is signed and waiting.
					<a href={saveLink} target="_blank" rel="noreferrer noopener">Open it in Google Wallet</a>
					. That link goes to Google and carries the ticket inside it, which is the only way this
					wallet accepts a pass.
				</p>
				{#each linkWarnings as warning, i (i)}
					<p class="note">{warning}</p>
				{/each}
			{/if}

			{#if previewRows.length}
				<details class="preview">
					<summary>What the pass will say</summary>
					<dl>
						{#each previewRows as row, i (i)}
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						{/each}
					</dl>
					<p class="note">
						The barcode is copied byte for byte. Everything above was read out of it, and the
						original ticket is still the one that counts.
					</p>
				</details>
			{/if}
		{/if}

		{#if credentials.apple || googleHeld}
			<p class="note held">
				Signing with
				{#if credentials.apple}<code>{credentials.apple.label}</code>{/if}
				{#if credentials.apple && googleHeld}and{/if}
				{#if googleHeld}<code>Google issuer {credentials.google?.issuerId}</code>{/if}.
				<label>
					<input
						type="checkbox"
						checked={credentials.remember}
						onchange={(e) => credentials.setRemember(e.currentTarget.checked)}
					/>
					keep on this device
				</label>
				<button class="link" onclick={() => credentials.forget()}>forget</button>
			</p>
		{/if}
	</section>

	{#if setup === 'apple'}
		<section class="setup">
			<h4>Apple pass signing certificate</h4>
			<p class="note">
				From your Apple Developer account: a Pass Type ID certificate and its private key, as PEM.
				If you have the .p12 that Keychain exports, split it first:
			</p>
			<pre><code
					>openssl pkcs12 -legacy -in Certificates.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -legacy -in Certificates.p12 -nocerts -nodes -out key.pem</code
				></pre>
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
				<button onclick={() => (setup = null)}>Cancel</button>
			</div>
			<p class="note">
				Neither file is uploaded anywhere. The key is imported so the browser can sign with it and
				cannot export it again.
			</p>
		</section>
	{:else if setup === 'google'}
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
				<button onclick={() => (setup = null)}>Cancel</button>
			</div>
		</section>
	{/if}
{/if}

<style>
	.wallet,
	.setup {
		border-top: 1px dashed var(--paper-edge);
		margin-top: 0.9rem;
		padding-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h3,
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
	button.link {
		border: 0;
		padding: 0;
		text-decoration: underline;
		font-size: inherit;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.note.warn {
		color: var(--signal-red);
	}
	.held {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.held label {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.95em;
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
	.setup label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.setup input[type='text'] {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		background: transparent;
		color: var(--ink);
	}
	.preview summary {
		font-size: 0.8rem;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.preview dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.8rem;
		margin: 0.4rem 0;
		font-size: 0.85rem;
	}
	.preview dt {
		color: var(--ink-soft);
	}
	.preview dd {
		margin: 0;
	}
</style>
