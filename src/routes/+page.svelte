<script lang="ts">
	import DropZone from '$lib/components/DropZone.svelte';
	import CameraScanner from '$lib/components/CameraScanner.svelte';
	import TicketCard from '$lib/components/TicketCard.svelte';
	import { store } from '../lib/state/tickets.svelte.ts';
	import { makeTicket } from '../lib/tickets/parse.ts';
	import { onMount } from 'svelte';

	let busy = $state(false);
	let cameraOpen = $state(false);
	const cameraSupported =
		typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

	const SAMPLES = [
		{ file: 'muster-super-sparpreis.bin', name: 'Muster Super Sparpreis (with Zugbindung)' },
		{ file: 'muster-quer-durchs-land.bin', name: 'Muster Quer-durchs-Land-Ticket' }
	];

	async function loadSamples(files?: { file: string; name: string }[]) {
		for (const s of files ?? SAMPLES) {
			const res = await fetch(`/samples/${s.file}`);
			if (!res.ok) continue;
			const bytes = new Uint8Array(await res.arrayBuffer());
			store.add(makeTicket(bytes, { kind: 'raw', fileName: s.name }));
		}
	}

	onMount(() => {
		const sample = new URLSearchParams(location.search).get('sample');
		if (sample === '') loadSamples();
		else if (sample) loadSamples([{ file: sample, name: sample }]);
	});
</script>

<svelte:head>
	<title>ticketish - read your train ticket</title>
	<meta
		name="description"
		content="Decode UIC 918.3 / 918.9 train ticket barcodes in your browser - including the DB Zugbindung. Nothing leaves your device."
	/>
</svelte:head>

<div class="page">
	<header class="masthead">
		<h1>ticketish</h1>
		<p class="tagline">reads what your train ticket really says</p>
	</header>

	<section class="intake" aria-label="Scan a ticket">
		<DropZone bind:busy />
		{#if cameraSupported}
			<button class="camera" onclick={() => (cameraOpen = true)}>
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
					<path
						fill="currentcolor"
						d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5.5A5.5 5.5 0 1 1 6.5 14 5.5 5.5 0 0 1 12 8.5Zm0 2A3.5 3.5 0 1 0 15.5 14 3.5 3.5 0 0 0 12 10.5Z"
					/>
				</svg>
				Scan with camera
			</button>
		{/if}
	</section>

	{#if store.errors.length}
		<section class="errors" aria-live="polite">
			{#each store.errors as err, i (err + i)}
				<p class="error">
					{err}
					<button onclick={() => store.dismissError(i)} aria-label="Dismiss">✕</button>
				</p>
			{/each}
		</section>
	{/if}

	{#if store.tickets.length}
		<section class="tickets" aria-label="Scanned tickets">
			{#each store.tickets as ticket (ticket.id)}
				<TicketCard {ticket} />
			{/each}
		</section>
	{:else}
		<section class="empty">
			<p>
				No tickets yet. Feed it a DB online ticket, an Interrail pass, a seat reservation - any
				<strong>UIC&nbsp;918.3</strong> or <strong>918.9</strong> barcode as an image, PDF, Apple
				Wallet pass, or straight from the camera.
			</p>
			<p class="fine">
				Decoding happens entirely in this browser tab. Ticket data is kept in memory only and
				never uploaded anywhere. Signatures are not verified - this reads tickets, it doesn't
				judge them.
			</p>
			<button class="sample" onclick={() => loadSamples()}>Try it with DB sample tickets</button>
		</section>
	{/if}

	<footer>
		<p>
			Runs fully offline once installed · UIC ASN.1 specs © UIC via
			<a href="https://github.com/UnionInternationalCheminsdeFer/UIC-barcode">UIC-barcode</a> ·
			inspired by <a href="https://github.com/TheEnbyperor/zuegli">zuegli</a>
		</p>
	</footer>
</div>

{#if cameraOpen}
	<CameraScanner onclose={() => (cameraOpen = false)} />
{/if}

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	.masthead h1 {
		font-size: 2.4rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: none;
	}
	.masthead h1::first-letter {
		color: var(--signal-red);
	}
	.tagline {
		margin: 0.1rem 0 0;
		color: var(--bg-text-soft);
	}
	.intake {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.camera {
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 1.3rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		background: transparent;
		color: var(--bg-text);
		font-weight: 500;
	}
	.camera:hover {
		border-color: var(--rail-blue);
		color: var(--rail-blue);
	}
	.errors {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.error {
		margin: 0;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: baseline;
		border: 1px solid color-mix(in srgb, var(--signal-red) 50%, transparent);
		color: var(--signal-red);
		border-radius: 6px;
		padding: 0.45rem 0.7rem;
		font-size: 0.88rem;
	}
	.error button {
		background: none;
		border: none;
		color: inherit;
		padding: 0;
	}
	.tickets {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.empty {
		border-top: 1px solid var(--hairline);
		padding-top: 1rem;
		max-width: 60ch;
	}
	.empty p {
		margin: 0 0 0.6rem;
	}
	.fine {
		font-size: 0.85rem;
		color: var(--bg-text-soft);
	}
	.sample {
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.45rem 1.1rem;
		color: var(--bg-text);
		font-weight: 500;
	}
	.sample:hover {
		border-color: var(--rail-blue);
		color: var(--rail-blue);
	}
	footer {
		margin-top: 1rem;
		border-top: 1px solid var(--hairline);
		padding-top: 0.8rem;
		font-size: 0.8rem;
		color: var(--bg-text-soft);
	}
	footer p {
		margin: 0;
	}
	footer a {
		color: inherit;
	}
</style>
