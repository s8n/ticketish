<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { HzppSegment, HzppTicket } from '../tickets/hzpp/hzpp.ts';
	import { fmtDate, fmtPrice } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';
	import RouteLine from './RouteLine.svelte';
	import { loadUicStations, uicStationLabel, type StationTable } from '../tickets/stations.ts';

	let { ticket }: { ticket: HzppTicket } = $props();

	// The station ids are UIC codes, so the bundled table names the larger ones.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		if (!ticket.encrypted) loadUicStations().then((s) => (stations = s));
	});

	const station = (id: number) => uicStationLabel(stations, id);

	const outward = $derived(ticket.encrypted ? null : (ticket.segments[0] ?? null));
	const inward = $derived(ticket.encrypted ? null : (ticket.segments[1] ?? null));

	/** Local time, since an HŽPP ticket is read where the train runs. */
	function fmtLocal(iso: string | null): string | null {
		if (!iso) return null;
		const time = new Date(iso).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Europe/Zagreb'
		});
		return `${fmtDate(iso.slice(0, 10))} ${time}`;
	}

	function trains(seg: HzppSegment): string | null {
		if (!seg.trains.length) return null;
		return seg.trains
			.map((t) =>
				[
					`train ${t.trainNumber}`,
					t.seat ? `seat ${t.seat}` : null,
					t.reservationReference ? `ref ${t.reservationReference}` : null
				]
					.filter(Boolean)
					.join(' · ')
			)
			.join('; ');
	}

	const passengers = $derived(
		ticket.encrypted
			? null
			: ticket.passengers.map((p) => `${p.count}× ${p.passengerTypeName}`).join(', ') || null
	);

	const returnLeg = $derived(
		inward
			? [
					`${station(inward.originStation) ?? '–'} - ${station(inward.destinationStation) ?? '–'}`,
					trains(inward),
					inward.travelClassName
				]
					.filter(Boolean)
					.join(' · ')
			: null
	);

	const rows = $derived<[string, string | null | undefined][]>(
		ticket.encrypted
			? []
			: [
					['Valid from', fmtLocal(ticket.validFrom)],
					['Valid until', fmtLocal(ticket.validUntil)],
					['Class', outward?.travelClassName],
					['Train type', outward?.trainTypeName],
					['Trains', outward ? trains(outward) : null],
					['Passengers', passengers],
					['Ticket number', ticket.ticketNumber],
					['Price', fmtPrice(ticket.price, ticket.currency, 2)],
					['Via route', outward?.routeNumber ? String(outward.routeNumber) : null],
					['Return', returnLeg],
					['Extended validity', ticket.extendedValidity ? 'yes' : null],
					['Bought on board', ticket.issuedOnBoard ? 'yes' : null]
				]
	);
</script>

{#if ticket.encrypted}
	<div class="sealed">
		<header><span class="product">HŽPP ticket</span></header>
		<p class="note">
			This one is encrypted: {ticket.cipherLength} bytes of AES-CBC ciphertext with the initialisation
			vector in the last 16. HŽPP does not publish the key and nothing here can decrypt it, so the
			ticket can be identified but not read.
		</p>
	</div>
{:else}
	<SimpleTicketView
		title={ticket.ticketTypeName}
		from={outward ? station(outward.originStation) : null}
		to={outward ? station(outward.destinationStation) : null}
		{rows}
	/>
	{#if inward}
		<div class="leg">
			<h4>Return</h4>
			<RouteLine
				from={station(inward.originStation)}
				to={station(inward.destinationStation)}
				size="sm"
			/>
		</div>
	{/if}
{/if}

<style>
	.sealed {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.product {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.2rem;
		text-transform: uppercase;
	}
	.note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
	.leg {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
		margin-top: 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	h4 {
		margin: 0;
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.78rem;
		color: var(--ink-soft);
		font-weight: 600;
	}
</style>
