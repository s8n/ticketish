<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * Pasting a payload in as text, for the barcode that will not scan and the
	 * one that arrived as a string in the first place.
	 *
	 * The reading that won is shown rather than assumed: text and base64 are
	 * both plausible for the same paste, and knowing which one the parser took
	 * is the difference between a decode and a coincidence.
	 */
	import { readPasted, type Reading } from '../input/pasted.ts';
	import { makeTicket } from '../tickets/parse.ts';
	import { store } from '../state/tickets.svelte.ts';

	let { onclose }: { onclose: () => void } = $props();

	let text = $state('');
	let note = $state<string | null>(null);
	let field = $state<HTMLTextAreaElement>();

	const READINGS: Record<Reading, string> = {
		text: 'as text',
		latin1: 'as Latin-1 text',
		base64: 'as base64'
	};

	function read() {
		const payload = readPasted(text);
		if (!payload) {
			note = 'Nothing to read yet.';
			return;
		}
		store.add(
			makeTicket(payload.bytes, { kind: 'pasted', fileName: READINGS[payload.reading] })
		);
		note = payload.kind
			? `Read ${payload.bytes.length} bytes ${READINGS[payload.reading]}.`
			: `No format recognised this, so it is shown ${READINGS[payload.reading]} as it stands.`;
		text = '';
		field?.focus();
	}
</script>

<div class="raw">
	<label for="raw-payload">Paste a payload, as text or base64</label>
	<textarea
		id="raw-payload"
		bind:this={field}
		bind:value={text}
		rows="4"
		spellcheck="false"
		autocapitalize="off"
		autocomplete="off"
		placeholder="#UT01… or the base64 of a barcode"
	></textarea>
	{#if note}<p class="note" aria-live="polite">{note}</p>{/if}
	<div class="actions">
		<button class="read" onclick={read} disabled={!text.trim()}>Read it</button>
		<button class="close" onclick={onclose}>Close</button>
	</div>
</div>

<style>
	.raw {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		padding: 0.8rem;
	}
	label {
		font-size: 0.85rem;
		color: var(--bg-text-soft);
	}
	textarea {
		width: 100%;
		resize: vertical;
		font-family: var(--font-mono, monospace);
		font-size: 0.85rem;
		padding: 0.5rem;
		border: 1px solid var(--hairline);
		border-radius: 6px;
		background: transparent;
		color: var(--bg-text);
	}
	textarea:focus {
		outline: none;
		border-color: var(--rail-blue);
	}
	.note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--bg-text-soft);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	button {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.4rem 1.1rem;
		background: transparent;
		color: var(--bg-text);
		font-weight: 500;
	}
	button:hover:not(:disabled) {
		border-color: var(--rail-blue);
		color: var(--rail-blue);
	}
	button:disabled {
		opacity: 0.5;
	}
</style>
