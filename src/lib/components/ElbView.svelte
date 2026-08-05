<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { ElbSegment, ElbTicket } from '../tickets/elb/elb.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';
	import { loadBenerailStations, benerailStationLabel, type StationTable } from '../tickets/stations.ts';

	let { ticket }: { ticket: ElbTicket } = $props();

	// Loads on demand: until it lands the mnemonics show, the way they did
	// before the table existed.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		loadBenerailStations().then((s) => (stations = s));
	});

	const outward = $derived(ticket.segments[0]);
	const inward = $derived(ticket.segments[1] ?? null);

	const origin = $derived(benerailStationLabel(stations, outward.departureStation));
	const destination = $derived(benerailStationLabel(stations, outward.arrivalStation));
	// The mnemonics are what is actually in the barcode, so keep them visible
	// once the route line has been replaced by names.
	const codes = $derived(
		origin !== outward.departureStation || destination !== outward.arrivalStation
			? `${outward.departureStation} → ${outward.arrivalStation}`
			: null
	);

	// "1" and "2" are the only codes seen that mean a class; anything else is a
	// fare letter (e.g. "H") and is shown as printed.
	const classLabel = (c: string) => ({ '1': '1st class', '2': '2nd class' })[c] ?? c;

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
					`${benerailStationLabel(stations, inward.departureStation)} - ${benerailStationLabel(stations, inward.arrivalStation)}`,
					inward.trainNumber ? `train ${inward.trainNumber}` : null,
					inward.departureDate ? fmtDate(inward.departureDate) : null,
					place(inward) || null,
					inward.travelClass.trim() ? classLabel(inward.travelClass) : null
				]
					.filter(Boolean)
					.join(' · ')
			: null
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Travel date', outward.departureDate ? fmtDate(outward.departureDate) : null],
		['Class', outward.travelClass.trim() ? classLabel(outward.travelClass) : null],
		['Place', place(outward)],
		['Passengers', passengers],
		['PNR', ticket.pnr],
		['Ticket number', `${ticket.ticketCode}${ticket.ticketNumber}`],
		['Ticket', sequence],
		['Tariff', outward.tariffCode],
		['Service', outward.classOfService],
		['Station codes', codes],
		['Return', returnLeg],
		['Issued', ticket.issuedDate ? fmtDate(ticket.issuedDate) : null],
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
