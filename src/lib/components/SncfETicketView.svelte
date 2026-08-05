<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { SncfETicket } from '../tickets/sncf/eticket.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';
	import { loadBenerailStations, benerailStationLabel, type StationTable } from '../tickets/stations.ts';

	let { ticket }: { ticket: SncfETicket } = $props();

	// Loads on demand: until it lands the mnemonics show, the way they did
	// before the table existed.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		loadBenerailStations().then((s) => (stations = s));
	});

	const origin = $derived(benerailStationLabel(stations, ticket.originCode));
	const destination = $derived(benerailStationLabel(stations, ticket.destinationCode));
	// The mnemonics are what is actually in the barcode, so keep them visible
	// once the route line has been replaced by names.
	const codes = $derived(
		origin !== ticket.originCode || destination !== ticket.destinationCode
			? `${ticket.originCode} → ${ticket.destinationCode}`
			: null
	);

	const classLabel = $derived(
		{ '1': '1st class', '2': '2nd class' }[ticket.travelClass] ?? ticket.travelClass
	);

	const pad = (n: number) => String(n).padStart(2, '0');
	// no year in the record, so a day.month. stub is all that can be shown
	const travelDate = $derived(
		ticket.travelDate ? `${pad(ticket.travelDate.day)}.${pad(ticket.travelDate.month)}.` : null
	);

	const passenger = $derived([ticket.forename, ticket.surname].filter(Boolean).join(' '));

	const returnLeg = $derived(
		ticket.returnLeg
			? [
					`${benerailStationLabel(stations, ticket.returnLeg.originCode)} - ${benerailStationLabel(stations, ticket.returnLeg.destinationCode)}`,
					ticket.returnLeg.trainNumber ? `train ${ticket.returnLeg.trainNumber}` : null
				]
					.filter(Boolean)
					.join(' · ')
			: null
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Travel date', travelDate],
		['Class', classLabel],
		['Passenger', passenger],
		['Date of birth', ticket.dateOfBirth ? fmtDate(ticket.dateOfBirth) : null],
		['PNR', ticket.pnr],
		['Ticket number', ticket.ticketNumber],
		['Customer reference', ticket.customerReference],
		['Tariff', ticket.tariffCode],
		['Station codes', codes],
		['Return', returnLeg],
		['Undecoded', ticket.extraFields.length ? ticket.extraFields.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	from={origin}
	to={destination}
	{rows}
/>
