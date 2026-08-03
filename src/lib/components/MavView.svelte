<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { MavTicket } from '../tickets/mav/mav.ts';
	import { mavStationLabel } from '../tickets/mav/mav.ts';
	import { fmtDate, fmtPrice, fmtZoned } from '../tickets/format.ts';
	import { ricsName } from '../tickets/uic/rics.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';
	import { loadUicStations, type StationTable } from '../tickets/stations.ts';

	let { ticket }: { ticket: MavTicket } = $props();

	// Only the UIC numbering, which versions up to 4 use, can be named. Loads
	// on demand, so the raw codes show until it lands.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		if (ticket.stationNumbering === 'uic') loadUicStations().then((s) => (stations = s));
	});

	const station = (id: number) => mavStationLabel(ticket, stations, id);

	const trip = $derived(ticket.trip);

	/** Local time, since a MÁV ticket is read where the train runs. */
	const fmtTime = (iso: string | null) => fmtZoned(iso, 'Europe/Budapest');

	/** Validity periods run to days, so minutes alone read badly. */
	function fmtMinutes(total: number): string | null {
		if (!total) return null;
		const days = Math.floor(total / 1440);
		const hours = Math.floor((total % 1440) / 60);
		const mins = total % 60;
		return (
			[
				days ? `${days}d` : null,
				hours ? `${hours}h` : null,
				mins ? `${mins}min` : null
			]
				.filter(Boolean)
				.join(' ') || '0min'
		);
	}

	const classLabel = $derived(
		trip ? ({ '1': '1st class', '2': '2nd class' }[trip.travelClass] ?? trip.travelClass) : null
	);

	const via = $derived(
		trip && trip.via.length ? trip.via.map(station).filter(Boolean).join(' · ') : null
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Departs', fmtTime(trip?.departureTime ?? null)],
		['Class', classLabel],
		['Valid for', trip ? fmtMinutes(trip.validityMinutes) : null],
		['Passengers', trip && trip.numPassengers > 1 ? String(trip.numPassengers) : null],
		['Via', via],
		['Traveler', ticket.person?.name || null],
		['Born', ticket.person?.dateOfBirth ? fmtDate(ticket.person.dateOfBirth) : null],
		['ID card', ticket.person?.idCardNumber],
		['Ticket number', ticket.ticketNumber],
		['Price', ticket.price ? fmtPrice(ticket.price, 'HUF', 0) : null],
		['Issued', fmtTime(ticket.issuedAt)],
		['Bought as', ticket.ticketMedium ?? `medium ${hex(ticket.ticketMediumCode)}`],
		// No mapping from these ids to product names is published anywhere.
		['Ticket type', trip ? hex(trip.ticketName) : null],
		['Discount', trip?.discountName ? hex(trip.discountName) : null]
	]);

	function hex(n: number): string {
		return `0x${n.toString(16).padStart(8, '0')}`;
	}
</script>

<SimpleTicketView
	title={ticket.reservations[0]?.trainNumber
		? `Train ${ticket.reservations[0].trainNumber}`
		: 'MÁV ticket'}
	from={trip ? station(trip.departureStation) : null}
	to={trip ? station(trip.destinationStation) : null}
	{rows}
/>

{#each ticket.reservations as r, i (i)}
	<section class="block">
		<h4 class="block-title">Reservation</h4>
		<dl class="fields">
			<dt>Route</dt>
			<dd>{station(r.departureStation) ?? '–'} → {station(r.destinationStation) ?? '–'}</dd>
			{#if r.trainNumber}<dt>Train</dt>
				<dd>{r.trainNumber}</dd>{/if}
			{#if r.departureTime}<dt>Departs</dt>
				<dd>{fmtTime(r.departureTime)}</dd>{/if}
			{#if r.coach}<dt>Coach</dt>
				<dd>{r.coach}</dd>{/if}
			{#if r.seats.length}<dt>Seat{r.seats.length > 1 ? 's' : ''}</dt>
				<dd>{r.seats.join(', ')}</dd>{/if}
			{#if r.operatorRics}<dt>Operator</dt>
				<dd>{ricsName(r.operatorRics) ?? `RICS ${r.operatorRics}`}</dd>{/if}
		</dl>
	</section>
{/each}

{#each ticket.supplements as s, i (i)}
	<section class="block">
		<h4 class="block-title">Supplement</h4>
		<dl class="fields">
			<dt>Route</dt>
			<dd>{station(s.departureStation) ?? '–'} → {station(s.destinationStation) ?? '–'}</dd>
			{#if s.validFrom}<dt>Valid from</dt>
				<dd>{fmtTime(s.validFrom)}</dd>{/if}
			{#if s.validityMinutes}<dt>Valid for</dt>
				<dd>{fmtMinutes(s.validityMinutes)}</dd>{/if}
			{#if s.travelClass}<dt>Class</dt>
				<dd>{s.travelClass}</dd>{/if}
		</dl>
	</section>
{/each}

{#each ticket.passes as p, i (i)}
	<section class="block">
		<h4 class="block-title">Pass</h4>
		<dl class="fields">
			<dt>Type</dt>
			<dd><code>{hex(p.passName)}</code></dd>
			{#if p.validFrom}<dt>Valid from</dt>
				<dd>{fmtTime(p.validFrom)}</dd>{/if}
			{#if p.validityMinutes}<dt>Valid for</dt>
				<dd>{fmtMinutes(p.validityMinutes)}</dd>{/if}
			{#if p.numPassengers > 1}<dt>Passengers</dt>
				<dd>{p.numPassengers}</dd>{/if}
		</dl>
	</section>
{/each}

{#if ticket.stationNumbering === 'mav'}
	<p class="note">
		From version 5 the stations are MÁV's own numbering rather than UIC codes, and no table for
		it is bundled, so they are shown as issued.
	</p>
{/if}

<style>
	.note {
		margin: 0.7rem 0 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.5rem;
	}
</style>
