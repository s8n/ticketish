<script lang="ts">
	import type { TcddTicket } from '../tickets/tcdd/tcdd.ts';
	import { tcddStationName } from '../tickets/tcdd/tcdd.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TcddTicket } = $props();

	const rows = $derived<[string, string | null | undefined][]>([
		['Departure', ticket.departure ? fmtDate(ticket.departure) : null],
		['Place', ticket.coach || ticket.seat ? `car ${ticket.coach} · seat ${ticket.seat}` : null],
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
	from={tcddStationName(ticket.originCode)}
	to={tcddStationName(ticket.destinationCode)}
	{rows}
/>
