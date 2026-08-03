<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { SwissPassTicket } from '../tickets/swisspass/swisspass.ts';
	import { fmtZurich, novaOrgName } from '../tickets/swisspass/swisspass.ts';

	let { ticket }: { ticket: SwissPassTicket } = $props();

	/* eslint-disable @typescript-eslint/no-explicit-any */
	const data = $derived(ticket.ticketData as any);
	const tariff = $derived(data.tariff ?? {});
	const traveler = $derived(data.traveler);
	const sale = $derived(data.sale ?? {});
	const payment = $derived(data.payment);

	const PAYMENT_METHODS: Record<string, string> = {
		MC: 'Mastercard',
		VIS: 'Visa',
		TWI: 'Twint',
		PLU: 'Halbtax Plus',
		PCD: 'Postcard Debit',
		FAK: 'Invoice'
	};

	const classLabel = $derived(
		tariff.travelClass === 'first'
			? '1st class'
			: tariff.travelClass === 'second'
				? '2nd class'
				: tariff.travelClass
	);

	function birthday(): string | null {
		return traveler?.birthday ? (fmtZurich(traveler.birthday) ?? '').slice(0, 10) : null;
	}
</script>

<div class="sp">
	<header>
		<span class="product">{tariff.product?.name ?? 'SwissPass ticket'}</span>
		{#if classLabel}<span class="chip">{classLabel}</span>{/if}
		{#if tariff.tariff}<span class="chip">{tariff.tariff}</span>{/if}
	</header>

	{#if tariff.departureStation || tariff.arrivalStation}
		<div class="route">
			<span class="station">{tariff.departureStation ?? '–'}</span>
			<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
			<span class="station">{tariff.arrivalStation ?? '–'}</span>
		</div>
	{/if}

	{#if tariff.zones?.length}
		<div class="zones">
			{#each tariff.zones as z, i (i)}
				<span class="zone">
					{z.allZones ? 'all zones' : `Zone ${z.zoneId}`}
					{#if novaOrgName(z.zoneOrg)}<span class="zone-org">{novaOrgName(z.zoneOrg)}</span>{/if}
				</span>
			{/each}
		</div>
	{/if}

	<dl>
		{#if tariff.route?.length}<dt>Route</dt>
			<dd>{tariff.route.join(' · ')}</dd>{/if}
		{#if tariff.validFrom}<dt>Valid from</dt>
			<dd>{fmtZurich(tariff.validFrom)}</dd>{/if}
		{#if tariff.validUntil}<dt>Valid until</dt>
			<dd>{fmtZurich(tariff.validUntil)}</dd>{/if}
		{#if tariff.journeyType && tariff.journeyType !== 'unknown'}<dt>Journey</dt>
			<dd>{tariff.journeyType}</dd>{/if}
		{#if payment?.price}<dt>Price</dt>
			<dd>
				{payment.price}
				{payment.currency ?? ''}
				{#if payment.paymentMethod}
					<span class="soft">via {PAYMENT_METHODS[payment.paymentMethod] ?? payment.paymentMethod}</span>
				{/if}
			</dd>{/if}
		{#if data.ticketId}<dt>Ticket ID</dt>
			<dd><code>{data.ticketId}</code></dd>{/if}
	</dl>

	{#if data.transport?.length}
		<dl>
			{#each data.transport as tr, i (i)}
				<dt>Service</dt>
				<dd>
					{tr.journeyNumber ?? ''}{tr.carriage ? ` · carriage ${tr.carriage}` : ''}
					{tr.seats?.length ? ` · seat ${tr.seats.join(', ')}` : ''}
					{#if tr.type && tr.type !== 'unknown'}<span class="soft">({tr.type})</span>{/if}
				</dd>
			{/each}
		</dl>
	{/if}

	{#if traveler}
		<section class="traveler">
			<h4>Traveler</h4>
			<dl>
				{#if traveler.forename || traveler.surname}
					<dt>Name</dt>
					<dd>{[traveler.forename, traveler.surname].filter(Boolean).join(' ')}</dd>
				{/if}
				{#if birthday()}<dt>Born</dt>
					<dd>{birthday()}</dd>{/if}
				{#if traveler.tariff}<dt>Type</dt>
					<dd>{traveler.tariff}</dd>{/if}
				{#if traveler.reduction}<dt>Reduction</dt>
					<dd>{traveler.reduction}</dd>{/if}
				{#if traveler.customerNumber}<dt>Customer no.</dt>
					<dd><code>{traveler.customerNumber}</code></dd>{/if}
				{#if traveler.swisspassId}<dt>SwissPass ID</dt>
					<dd><code>{traveler.swisspassId}</code></dd>{/if}
			</dl>
		</section>
	{/if}

	<dl class="issuing">
		{#if novaOrgName(sale.issuingOrg)}
			<dt>Issued by</dt>
			<dd>{novaOrgName(sale.issuingOrg)} <span class="soft">(org {sale.issuingOrg})</span></dd>
		{:else if sale.issuingOrg}
			<dt>Issuing org</dt>
			<dd>{sale.issuingOrg}</dd>
		{/if}
		{#if sale.sellingTime}<dt>Sold</dt>
			<dd>{fmtZurich(sale.sellingTime)}</dd>{/if}
	</dl>
</div>

<style>
	.sp {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.product {
		font-weight: 600;
		font-size: 1.05rem;
	}
	.chip {
		color: var(--rail-blue);
	}
	.route {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.station {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.3rem;
		text-transform: uppercase;
	}
	.line {
		flex: 1;
		min-width: 3.5rem;
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
	.zones {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.zone {
		font-size: 0.8rem;
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
	}
	.zone-org {
		color: var(--ink-soft);
		margin-left: 0.3rem;
		font-size: 0.72rem;
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
	h4 {
		margin: 0 0 0.3rem;
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.78rem;
		color: var(--ink-soft);
		font-weight: 600;
	}
	.traveler,
	.issuing {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
	}
</style>
