<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { TrenitaliaTicket } from '../tickets/trenitalia/trenitalia.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TrenitaliaTicket } = $props();

	const place = $derived(
		[ticket.coach ? `coach ${ticket.coach}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
			.filter(Boolean)
			.join(' · ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Departure', ticket.departureDate ? fmtDate(ticket.departureDate) : null],
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
