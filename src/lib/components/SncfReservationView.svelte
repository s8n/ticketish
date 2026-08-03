<script lang="ts">
	import type { SncfReservation } from '../tickets/sncf/reservation.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: SncfReservation } = $props();

	// "1" and "2" are the only codes seen that mean a class; anything else is a
	// fare letter (e.g. "H") and is shown as printed.
	const classLabel = $derived(
		{ '1': '1st class', '2': '2nd class' }[ticket.travelClass] ?? ticket.travelClass
	);

	const place = $derived(
		[ticket.coach ? `coach ${ticket.coach}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
			.filter(Boolean)
			.join(' · ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Class', classLabel],
		['Place', place],
		['PNR', ticket.pnr],
		['Ticket number', `${ticket.numberPrefix}${ticket.ticketNumber}`],
		['Tariff', ticket.tariffCode],
		['Service', ticket.serviceCode],
		['Undecoded', ticket.extraFields.length ? ticket.extraFields.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	from={ticket.originCode}
	to={ticket.destinationCode}
	{rows}
	note={'Reverse engineered, no specification available. The record carries no travel date, and stations are SNCF mnemonics rather than UIC codes.'}
/>
