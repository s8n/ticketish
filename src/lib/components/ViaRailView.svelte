<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { ViaRailTicket } from '../tickets/viarail/viarail.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: ViaRailTicket } = $props();

	/** Both timestamps are local time at the station, so neither is converted. */
	function fmtLocal(value: string | null): string | null {
		if (!value) return null;
		return `${fmtDate(value.slice(0, 10))} ${value.slice(11, 16)}`;
	}

	const passenger = $derived([ticket.givenName, ticket.surname].filter(Boolean).join(' '));

	const place = $derived(
		[ticket.car ? `car ${ticket.car}` : null, ticket.seat ? `seat ${ticket.seat}` : null]
			.filter(Boolean)
			.join(' · ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Departs', fmtLocal(ticket.departureTime)],
		['Place', place],
		['Passenger', passenger],
		['Passenger type', ticket.passengerTypeLabel],
		['Fare class', ticket.inventoryClass],
		['VIA Préférence', ticket.loyaltyLevel],
		['PNR', ticket.pnr],
		['Ticket number', ticket.ticketNumber],
		['Purchased', fmtLocal(ticket.purchaseTime)]
	]);
</script>

<SimpleTicketView
	title={ticket.train ? `Train ${ticket.train}` : 'Boarding pass'}
	from={ticket.departureStation}
	to={ticket.arrivalStation}
	{rows}
	note={'Station codes are VIA’s own four letter ones, and no table for them is bundled. Both times are local at the station, since the record carries no time zone.'}
/>
