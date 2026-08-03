<script lang="ts">
	import type { TcddTicket } from '../tickets/tcdd/tcdd.ts';
	import { tcddStationName } from '../tickets/tcdd/tcdd.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TcddTicket } = $props();

	const hasRoute = $derived(!!(ticket.originCode || ticket.destinationCode));

	const rows = $derived<[string, string | null | undefined][]>([
		['Departure', ticket.departure ? fmtDate(ticket.departure) : null],
		[
			'Place',
			ticket.coach || ticket.seat
				? [ticket.coach ? `car ${ticket.coach}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
						.filter(Boolean)
						.join(' · ')
				: null
		],
		['Price', ticket.price ? `${ticket.price} TRY` : null],
		[
			'Full fare',
			ticket.fullPrice && ticket.fullPrice !== ticket.price ? `${ticket.fullPrice} TRY` : null
		],
		['PNR', ticket.pnr],
		['Ticket number', ticket.ticketNumber],
		['Purchased', ticket.purchased ? fmtDate(ticket.purchased) : null]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	from={hasRoute ? tcddStationName(ticket.originCode) : null}
	to={hasRoute ? tcddStationName(ticket.destinationCode) : null}
	{rows}
	note={ticket.variant === 'tcddprod'
		? 'Data may be incomplete, specification unavailable.'
		: null}
/>
