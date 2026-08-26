<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * A boarding pass, one block per flight leg and one for the booking they
	 * share. Airport and airline codes are shown as issued: BCBP names nothing,
	 * and no table for either is bundled.
	 */
	import type { BcbpLeg, BcbpTicket } from '../tickets/bcbp/bcbp.ts';
	import { fmtDate } from '../tickets/format.ts';
	import RouteLine from './RouteLine.svelte';

	let { ticket }: { ticket: BcbpTicket } = $props();

	const yesNo = (value: boolean | null) => (value === null ? null : value ? 'Yes' : 'No');

	/** Item 142 and item 143 together are the electronic ticket number. */
	const ticketNumber = (leg: BcbpLeg) =>
		leg.airlineNumericCode && leg.documentSerial
			? `${leg.airlineNumericCode} ${leg.documentSerial}`
			: (leg.documentSerial ?? null);

	const frequentFlyer = (leg: BcbpLeg) =>
		[leg.frequentFlyerAirline, leg.frequentFlyerNumber].filter(Boolean).join(' ') || null;

	const legRows = (leg: BcbpLeg): [string, string | null | undefined][] => [
		['Flight date', leg.flightDate ? fmtDate(leg.flightDate) : null],
		['Cabin', leg.compartmentLabel ?? leg.compartment],
		['Seat', leg.seat],
		['Booking reference', leg.pnr],
		['Sequence', leg.sequence],
		['Status', leg.passengerStatusLabel ?? leg.passengerStatus],
		['Ticket number', ticketNumber(leg)],
		// Only worth a row where the ticket was sold under someone else's code.
		['Marketed by', leg.marketingCarrier === leg.operatingCarrier ? null : leg.marketingCarrier],
		['Frequent flyer', frequentFlyer(leg)],
		['Baggage allowance', leg.freeBaggageAllowanceLabel],
		['Fast track', yesNo(leg.fastTrack)],
		// The seventh edition adds a selectee value it leaves the TSA to define,
		// so an unlabelled one is shown as the code it is.
		['Selectee', leg.selecteeLabel ?? leg.selectee],
		['Travel document check', leg.documentVerificationLabel ?? leg.documentVerification],
		['Industry discount', leg.idAdIndicatorLabel ?? leg.idAdIndicator],
		['Airline use', leg.airlineUse]
	];

	const bags = $derived(
		ticket.bagTags.map(
			(t) =>
				`${t.carrierNumericCode} ${t.initialTagNumber}${t.count > 1 ? ` (${t.count} bags)` : ''}`
		)
	);

	const bookingRows = $derived<[string, string | null | undefined][]>([
		['Passenger', ticket.passengerName],
		['Passenger type', ticket.passengerDescriptionLabel ?? ticket.passengerDescription],
		['Electronic ticket', yesNo(ticket.electronicTicket)],
		['Checked in via', ticket.sourceOfCheckInLabel ?? ticket.sourceOfCheckIn],
		['Pass issued via', ticket.sourceOfIssuanceLabel ?? ticket.sourceOfIssuance],
		['Issued by', ticket.issuerDesignator],
		['Issued', ticket.issueDate ? fmtDate(ticket.issueDate) : null],
		['Bag tags', bags.join(', ') || null],
		['Standard', ticket.version === null ? null : `Resolution 792 version ${ticket.version}`],
		// Pegasus pads its passes past the last field the record accounts for.
		['Unaccounted for', ticket.trailing]
	]);

	const visible = (rows: [string, string | null | undefined][]) =>
		rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
</script>

<div class="bcbp">
	{#each ticket.legs as leg, i (i)}
		<section class="leg" class:block={i > 0}>
			<header>
				<span class="product">{leg.operatingCarrier} {leg.flightNumber ?? ''}</span>
				{#if ticket.legs.length > 1}
					<span class="soft">Leg {i + 1} of {ticket.legs.length}</span>
				{/if}
			</header>
			<RouteLine from={leg.fromAirport} to={leg.toAirport} size="sm" />
			<dl class="fields">
				{#each visible(legRows(leg)) as [label, value] (label)}
					<dt>{label}</dt>
					<dd>{value}</dd>
				{/each}
			</dl>
		</section>
	{/each}

	<section class="block">
		<header>
			<span class="element-name">{ticket.documentTypeLabel ?? 'Booking'}</span>
		</header>
		<dl class="fields">
			{#each visible(bookingRows) as [label, value] (label)}
				<dt>{label}</dt>
				<dd>{value}</dd>
			{/each}
		</dl>
	</section>

	{#if ticket.security}
		<details class="readout">
			<summary>Signature{ticket.security.type ? ` (type ${ticket.security.type})` : ''}</summary>
			<code class="text">{ticket.security.data}</code>
		</details>
	{/if}
</div>

<style>
	.bcbp {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.leg {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	header {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.soft {
		color: var(--ink-soft);
		font-size: 0.82rem;
	}
	.element-name,
	summary {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.74rem;
		color: var(--ink-soft);
	}
	summary {
		cursor: pointer;
	}
	.text {
		font-size: 0.78rem;
		word-break: break-all;
		display: block;
		margin-top: 0.2rem;
	}
</style>
