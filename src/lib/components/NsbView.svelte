<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { NsbTicket } from '../tickets/nsb/nsb.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: NsbTicket } = $props();

	const rows = $derived<[string, string | null | undefined][]>([
		['Departure', ticket.departure],
		['Arrival', ticket.arrival]
	]);
</script>

<SimpleTicketView
	title="NSB ticket"
	{rows}
	note={'Barely decoded. No specification for this format is published, and only the two times above are placed: the record may describe one leg or the whole journey, and its stations, date, fare and reference number have not been found in it.'}
/>

<details class="raw">
	<summary>Undecoded payload ({ticket.byteLength} bytes)</summary>
	<code class="hex">{ticket.bodyHex}</code>
</details>

<style>
	.raw {
		margin-top: 0.7rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
	.hex {
		display: block;
		margin-top: 0.4rem;
		font-size: 0.72rem;
		line-height: 1.5;
		word-break: break-all;
		color: var(--ink-soft);
	}
</style>
