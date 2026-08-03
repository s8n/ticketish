<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { RenfeTicket } from '../tickets/renfe/renfe.ts';
	import { fmtDate } from '../tickets/format.ts';
	import RouteLine from './RouteLine.svelte';

	let { ticket }: { ticket: RenfeTicket } = $props();

	// A handful of Renfe station codes; unknown ones show as codes.
	const STATIONS: Record<string, string> = {
		'60000': 'Madrid P. Atocha',
		'71801': 'Barcelona-Sants',
		'70000': 'Barcelona França',
		'11014': 'Sevilla-Santa Justa',
		'03216': 'Valencia Joaquín Sorolla',
		'54413': 'Málaga María Zambrano',
		'15100': 'Córdoba',
		'20309': 'Zaragoza-Delicias',
		'22308': 'Valladolid-Campo Grande',
		'78400': 'Girona',
		'79300': 'Figueres-Vilafant',
		'04040': 'Alicante-Terminal'
	};

	const stationLabel = (code: string | undefined) =>
		code ? (STATIONS[code.padStart(5, '0')] ?? `Station ${code}`) : '?';
</script>

<div class="renfe">
	<header>
		<span class="product">Train {ticket.trainNumber}</span>
		{#if ticket.variant === 'qr'}<span class="chip">short form</span>{/if}
	</header>

	{#if ticket.originCode || ticket.destinationCode}
		<RouteLine
			from={stationLabel(ticket.originCode)}
			to={stationLabel(ticket.destinationCode)}
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
