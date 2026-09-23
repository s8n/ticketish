<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { NsbTicket } from '../tickets/nsb/nsb.ts';
	import SimpleTicketView, { type Row } from './SimpleTicketView.svelte';

	let { ticket }: { ticket: NsbTicket } = $props();

	const rows = $derived<Row[]>([
		['Departure', ticket.departure],
		['Arrival', ticket.arrival]
	]);
</script>

<SimpleTicketView
	title="NSB ticket"
	{rows}
	note={'Barely decoded. No specification for this format is published, and only the two times above are placed: the record may describe one leg or the whole journey, and its stations, date, fare and reference number have not been found in it.'}
	undecoded={{ label: 'Undecoded payload', hex: ticket.bodyHex }}
/>
