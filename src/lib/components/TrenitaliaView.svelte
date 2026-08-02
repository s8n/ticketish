<script lang="ts">
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
	note="Trenitalia publishes no specification for this barcode. The fields above were confirmed against printed tickets; the payload carries no departure time or station codes that could be identified."
/>
