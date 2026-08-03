<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { TcddTicket } from '../tickets/tcdd/tcdd.ts';
	import { loadTcddStations, tcddStationName } from '../tickets/tcdd/stations.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: TcddTicket } = $props();

	// a few hundred names, so they only come along when a Turkish ticket is shown
	let stations = $state<Record<string, string> | null>(null);
	$effect(() => {
		loadTcddStations().then((names) => (stations = names));
	});

	const hasRoute = $derived(!!(ticket.originCode || ticket.destinationCode));
	const station = (code: string) => tcddStationName(stations, code);

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
	from={hasRoute ? station(ticket.originCode) : null}
	to={hasRoute ? station(ticket.destinationCode) : null}
	{rows}
	note={ticket.variant === 'tcddprod'
		? 'Data may be incomplete, specification unavailable.'
		: null}
/>
