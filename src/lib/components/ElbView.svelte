<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import { elbClassLabel, type ElbSegment, type ElbTicket } from '../tickets/elb/elb.ts';
	import { fmtDate, fmtDateOrNull } from '../tickets/format.ts';
	import SimpleTicketView, { type Row } from './SimpleTicketView.svelte';
	import { loadBenerailStations, benerailStationLabel } from '../tickets/stations.ts';
	import { table } from './table.svelte.ts';

	let { ticket }: { ticket: ElbTicket } = $props();

	// Loads on demand: until it lands the mnemonics show.
	const stations = table(loadBenerailStations);

	const outward = $derived(ticket.segments[0]);
	const inward = $derived(ticket.segments[1] ?? null);

	const origin = $derived(benerailStationLabel(stations.value, outward.departureStation));
	const destination = $derived(benerailStationLabel(stations.value, outward.arrivalStation));
	// The mnemonics are what is actually in the barcode, so keep them visible
	// once the route line has been replaced by names.
	const codes = $derived(
		origin !== outward.departureStation || destination !== outward.arrivalStation
			? `${outward.departureStation} → ${outward.arrivalStation}`
			: null
	);

	const place = (s: ElbSegment) =>
		[s.coach ? `coach ${s.coach}` : null, s.seat ? `seat ${s.seat}` : null]
			.filter(Boolean)
			.join(' · ');

	const passengers = $derived(
		[
			ticket.numAdults ? `${ticket.numAdults} adult${ticket.numAdults > 1 ? 's' : ''}` : null,
			ticket.numChildren
				? `${ticket.numChildren} child${ticket.numChildren > 1 ? 'ren' : ''}`
				: null
		]
			.filter(Boolean)
			.join(', ')
	);

	const sequence = $derived(
		ticket.ticketInSequence && ticket.ticketsInSequence && ticket.ticketsInSequence > 1
			? `${ticket.ticketInSequence} of ${ticket.ticketsInSequence}`
			: null
	);

	/** The return leg, named the same way as the outward one. */
	const returnLeg = $derived(
		inward
			? [
					`${benerailStationLabel(stations.value, inward.departureStation)} - ${benerailStationLabel(stations.value, inward.arrivalStation)}`,
					inward.trainNumber ? `train ${inward.trainNumber}` : null,
					fmtDateOrNull(inward.departureDate),
					place(inward) || null,
					elbClassLabel(inward.travelClass)
				]
					.filter(Boolean)
					.join(' · ')
			: null
	);

	const rows = $derived<Row[]>([
		['Travel date', fmtDateOrNull(outward.departureDate)],
		['Class', elbClassLabel(outward.travelClass)],
		['Place', place(outward)],
		['Passengers', passengers],
		['PNR', ticket.pnr],
		['Ticket number', `${ticket.ticketCode}${ticket.ticketNumber}`],
		['Ticket', sequence],
		['Tariff', outward.tariffCode],
		['Service', outward.classOfService],
		['Station codes', codes],
		['Return', returnLeg],
		['Issued', fmtDateOrNull(ticket.issuedDate)],
		[
			'Valid',
			ticket.validFrom || ticket.validUntil
				? `${fmtDate(ticket.validFrom)} – ${fmtDate(ticket.validUntil)}`
				: null
		]
	]);
</script>

<SimpleTicketView
	title={outward.trainNumber ? `Train ${outward.trainNumber}` : 'Ticket'}
	from={origin}
	to={destination}
	{rows}
/>
