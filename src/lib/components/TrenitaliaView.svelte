<script lang="ts">
	import type { TrenitaliaTicket } from '../tickets/trenitalia/trenitalia.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TrenitaliaTicket } = $props();

	const rows = $derived<[string, string | null | undefined][]>([
		['Seat', ticket.seat],
		['PNR', ticket.pnr],
		['Entitlement number', String(ticket.entitlementNumber)]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	{rows}
	note="Trenitalia publishes no specification for this barcode. The fields above were confirmed against a printed ticket; travel dates, times, coach and stations are in the payload but not yet decoded."
/>
