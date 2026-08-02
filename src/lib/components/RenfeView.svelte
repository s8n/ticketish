<script lang="ts">
	import type { RenfeTicket } from '../tickets/renfe/renfe.ts';
	import { fmtDate } from '../tickets/format.ts';

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
		<div class="route">
			<span class="station" title={ticket.originCode ? `code ${ticket.originCode}` : undefined}>
				{stationLabel(ticket.originCode)}
			</span>
			<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
			<span class="station" title={ticket.destinationCode ? `code ${ticket.destinationCode}` : undefined}>
				{stationLabel(ticket.destinationCode)}
			</span>
		</div>
	{/if}

	<dl>
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
	.product {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.2rem;
		text-transform: uppercase;
	}
	.chip {
		color: var(--ink-soft);
	}
	.route {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: nowrap;
		overflow-x: auto;
	}
	.station {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.3rem;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.line {
		flex: 1;
		min-width: 3rem;
		display: flex;
		align-items: center;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ink);
	}
	.rail {
		flex: 1;
		border-top: 2px solid var(--ink);
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.15rem 1rem;
		margin: 0;
		font-size: 0.88rem;
	}
	dt {
		color: var(--ink-soft);
	}
	dd {
		margin: 0;
	}
	.soft {
		color: var(--ink-soft);
	}
</style>
