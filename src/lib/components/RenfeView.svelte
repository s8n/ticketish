<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { RenfeTicket } from '../tickets/renfe/renfe.ts';
	import {
		loadRenfeStations,
		renfeStationLabel
	} from '../tickets/renfe/stations.ts';
	import { fmtDate } from '../tickets/format.ts';
	import RouteLine from './RouteLine.svelte';
	import { table } from './table.svelte.ts';

	let { ticket }: { ticket: RenfeTicket } = $props();

	// the names only come along when a Spanish ticket is shown
	const stations = table(loadRenfeStations);
</script>

<div class="renfe">
	<header>
		<span class="product">Train {ticket.trainNumber}</span>
		{#if ticket.variant === 'qr'}<span class="chip">short form</span>{/if}
	</header>

	{#if ticket.originCode || ticket.destinationCode}
		<RouteLine
			from={renfeStationLabel(stations.value, ticket.originCode)}
			to={renfeStationLabel(stations.value, ticket.destinationCode)}
			fromTitle={ticket.originCode ? `code ${ticket.originCode}` : null}
			toTitle={ticket.destinationCode ? `code ${ticket.destinationCode}` : null}
			size="sm"
		/>
	{/if}

	<dl class="fields">
		<dt>Departure</dt>
		<dd>{fmtDate(ticket.departureDate)}{ticket.departureTime ? ` ${ticket.departureTime}` : ''}</dd>
		<dt>Place</dt>
		<dd>coach {ticket.coach} · seat {ticket.seat}</dd>
		{#if ticket.bookingReference}
			<dt>Localizador</dt>
			<dd><code>{ticket.bookingReference}</code> <span class="soft">{ticket.verificationCode}</span></dd>
		{/if}
		<dt>Ticket number</dt>
		<dd><code>{ticket.ticketNumber}</code></dd>
	</dl>
</div>

<style>
	.renfe {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	header {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.chip {
		color: var(--ink-soft);
	}
</style>
