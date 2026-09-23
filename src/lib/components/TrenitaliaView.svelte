<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { TrenitaliaTicket } from '../tickets/trenitalia/trenitalia.ts';
	import { fmtDateOrNull } from '../tickets/format.ts';
	import SimpleTicketView, { type Row } from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TrenitaliaTicket } = $props();

	const place = $derived(
		[ticket.coach ? `coach ${ticket.coach}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
			.filter(Boolean)
			.join(' · ')
	);

	const rows = $derived<Row[]>([
		['Departure', fmtDateOrNull(ticket.departureDate)],
		['Place', place || 'No reservation'],
		['PNR', ticket.pnr || null],
		['Entitlement number', String(ticket.entitlementNumber)]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	{rows}
	note="Data may be incomplete, specification unavailable."
/>
