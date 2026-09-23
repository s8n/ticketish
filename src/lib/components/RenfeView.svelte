<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { RenfeTicket } from '../tickets/renfe/renfe.ts';
	import { loadRenfeStations, renfeStationLabel } from '../tickets/renfe/stations.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView, { type Row } from './SimpleTicketView.svelte';
	import { table } from './table.svelte.ts';

	let { ticket }: { ticket: RenfeTicket } = $props();

	// the names only come along when a Spanish ticket is shown
	const stations = table(loadRenfeStations);

	const hasRoute = $derived(!!(ticket.originCode || ticket.destinationCode));

	const rows = $derived<Row[]>([
		[
			'Departure',
			`${fmtDate(ticket.departureDate)}${ticket.departureTime ? ` ${ticket.departureTime}` : ''}`
		],
		['Place', `coach ${ticket.coach} · seat ${ticket.seat}`],
		['Localizador', ticket.bookingReference, 'code'],
		['Verification code', ticket.bookingReference ? ticket.verificationCode : null],
		['Ticket number', ticket.ticketNumber, 'code']
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	badge={ticket.variant === 'qr' ? 'short form' : null}
	from={hasRoute ? renfeStationLabel(stations.value, ticket.originCode) : null}
	to={hasRoute ? renfeStationLabel(stations.value, ticket.destinationCode) : null}
	fromTitle={ticket.originCode ? `code ${ticket.originCode}` : null}
	toTitle={ticket.destinationCode ? `code ${ticket.destinationCode}` : null}
	{rows}
/>
