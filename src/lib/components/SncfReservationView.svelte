<script lang="ts">
	import type { SncfReservation } from '../tickets/sncf/reservation.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';
	import { loadSncfStations, sncfStationLabel, type StationTable } from '../tickets/stations.ts';

	let { ticket }: { ticket: SncfReservation } = $props();

	// Loads on demand: until it lands the mnemonics show, the way they did
	// before the table existed.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		loadSncfStations().then((s) => (stations = s));
	});

	const origin = $derived(sncfStationLabel(stations, ticket.originCode));
	const destination = $derived(sncfStationLabel(stations, ticket.destinationCode));
	// The mnemonics are what is actually in the barcode, so keep them visible
	// once the route line has been replaced by names.
	const codes = $derived(
		origin !== ticket.originCode || destination !== ticket.destinationCode
			? `${ticket.originCode} → ${ticket.destinationCode}`
			: null
	);

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
		['Station codes', codes],
		['Undecoded', ticket.extraFields.length ? ticket.extraFields.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	from={origin}
	to={destination}
	{rows}
	note={'Reverse engineered, no specification available. The record carries no travel date, and stations are SNCF mnemonics rather than UIC codes.'}
/>
