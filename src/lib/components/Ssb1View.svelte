<script lang="ts">
	import type { Ssb1Ticket } from '../tickets/ssb/ssb1.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: Ssb1Ticket } = $props();

	const travelers = $derived(
		[
			ticket.numAdults ? `${ticket.numAdults} adult${ticket.numAdults === 1 ? '' : 's'}` : null,
			ticket.numChildren
				? `${ticket.numChildren} child${ticket.numChildren === 1 ? '' : 'ren'}`
				: null
		]
			.filter(Boolean)
			.join(', ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		[
			'Departure',
			ticket.validFrom
				? `${fmtDate(ticket.validFrom)}${ticket.departureTime ? ` ${ticket.departureTime}` : ''}`
				: ticket.departureTime
		],
		[
			'Valid until',
			ticket.validUntil && ticket.validUntil !== ticket.validFrom ? fmtDate(ticket.validUntil) : null
		],
		['Train', ticket.trainNumber ? String(ticket.trainNumber) : null],
		[
			'Place',
			ticket.coachNumber || ticket.seat
				? [ticket.coachNumber ? `coach ${ticket.coachNumber}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
						.filter(Boolean)
						.join(' · ')
				: null
		],
		['Class', ticket.travelClass ? `${ticket.travelClass}nd class`.replace('1nd', '1st') : null],
		['Travelers', travelers],
		['Return', ticket.returnIncluded ? 'Included' : null],
		['Reference', ticket.pnr || null],
		['Reservation', ticket.reservationReference ? String(ticket.reservationReference) : null]
	]);
</script>

<SimpleTicketView
	title="Ticket"
	from={ticket.departureStation}
	to={ticket.arrivalStation}
	{rows}
/>
