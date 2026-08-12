<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { CdLegacyTicket } from '../tickets/cd/legacy.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: CdLegacyTicket } = $props();

	/** Already local time as printed, so nothing is converted. */
	const fmtLocal = (v: string | null) =>
		v ? `${fmtDate(v.slice(0, 10))} ${v.slice(11, 16)}` : null;

	const rows = $derived<[string, string | null | undefined][]>([
		['Valid from', fmtLocal(ticket.validFrom)],
		['Valid until', fmtLocal(ticket.validUntil)],
		['Issued', fmtLocal(ticket.issued)]
	]);
</script>

<SimpleTicketView
	title="ČD ticket"
	{rows}
	note={'The older ČD layout, for which no specification is published. Only the three timestamps are placed; the route, distance and fare are printed on the ticket but have not been found in the barcode.'}
/>

<details class="raw readout">
	<summary>Undecoded body ({ticket.bodyHex.length / 2} bytes)</summary>
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
