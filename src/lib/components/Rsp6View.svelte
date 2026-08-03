<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import { onMount } from 'svelte';
	import type { Rsp6Ticket, Rsp6TicketData, Rsp6RailcardData } from '../tickets/rsp/rsp6.ts';
	import { fmtDate } from '../tickets/format.ts';
	import { loadNlcNames, nlcEntry, nlcLabel, type NlcEntry } from '../tickets/rsp/nlc.ts';
	import RouteLine from './RouteLine.svelte';

	let { ticket }: { ticket: Rsp6Ticket } = $props();

	// The NLC table is large, so it loads only once an RSP ticket is on screen.
	let nlcNames = $state<Record<string, NlcEntry> | null>(null);
	onMount(async () => {
		nlcNames = await loadNlcNames();
	});

	const station = (code: string) => nlcLabel(nlcNames, code);
	const crs = (code: string) => nlcEntry(nlcNames, code)?.c;

	const data = $derived(ticket.data);
	const t = $derived(data?.kind === 'ticket' ? (data as Rsp6TicketData) : null);
	const rc = $derived(data?.kind === 'railcard' ? (data as Rsp6RailcardData) : null);

	const price = $derived(
		t?.purchase ? `£${(t.purchase.pricePence / 100).toFixed(2)}` : null
	);

	const COUPON_LABELS: Record<string, string> = {
		single: 'Single',
		season: 'Season',
		outbound: 'Return - outbound',
		inbound: 'Return - inbound'
	};
</script>

<div class="rsp">
	{#if !ticket.keyRecovered}
		<p class="error">
			Could not recover the ticket payload: {ticket.error}. The reference and issuer below come
			from the unencrypted part of the barcode.
		</p>
	{:else if ticket.error}
		<p class="error">Payload recovered but not parsed: {ticket.error}</p>
	{/if}

	{#if t}
		<!-- The three letter station code, kept beside the name the way a ticket
		     office screen shows it. -->
		{#snippet originCrs()}{#if crs(t.originNlc)}<span class="crs">{crs(t.originNlc)}</span>{/if}{/snippet}
		{#snippet destinationCrs()}{#if crs(t.destinationNlc)}<span class="crs">{crs(t.destinationNlc)}</span
			>{/if}{/snippet}
		<RouteLine
			from={station(t.originNlc)}
			to={station(t.destinationNlc)}
			fromTitle={t.originNlc ? `NLC ${t.originNlc}` : null}
			toTitle={t.destinationNlc ? `NLC ${t.destinationNlc}` : null}
			fromBadge={originCrs}
			toBadge={destinationCrs}
			size="sm"
		/>
		<dl class="fields">
			<dt>Fare</dt>
			<dd>{t.fareLabel} <span class="soft">(Lennon {t.lennonTicketType})</span></dd>
			<dt>Class</dt>
			<dd>{t.standardClass ? 'Standard' : 'First'}</dd>
			<dt>Coupon</dt>
			<dd>{COUPON_LABELS[t.couponType]}{t.childTicket ? ' · child' : ''}</dd>
			<dt>Valid from</dt>
			<dd>
				{fmtDate(t.startDate)}
				{#if t.departTimeFlag !== 'notSet'}<span class="soft">({t.departTimeFlag})</span>{/if}
			</dd>
			{#if t.purchase?.daysOfValidity}
				<dt>Validity</dt>
				<dd>{t.purchase.daysOfValidity} day{t.purchase.daysOfValidity > 1 ? 's' : ''}</dd>
			{/if}
			{#if t.routeCode}<dt>Route code</dt>
				<dd>{t.routeCode}</dd>{/if}
			{#if t.restrictionCode}<dt>Restriction</dt>
				<dd><code>{t.restrictionCode}</code></dd>{/if}
			{#if t.discountCode}<dt>Discount code</dt>
				<dd>{t.discountCode}</dd>{/if}
			{#if price}<dt>Price</dt>
				<dd>{price}</dd>{/if}
			{#if t.purchase}
				<dt>Purchased</dt>
				<dd>{fmtDate(t.purchase.purchaseDate)}</dd>
				{#if t.purchase.purchaseReference}
					<dt>Purchase ref</dt>
					<dd><code>{t.purchase.purchaseReference}</code></dd>
				{/if}
			{/if}
			{#if t.sellingNlc}<dt>Sold by</dt>
				<dd>{station(t.sellingNlc)}</dd>{/if}
			{#if t.freeUse}<dt>Notes</dt>
				<dd class="small">{t.freeUse}</dd>{/if}
		</dl>
		{#if t.reservations.length}
			<dl class="fields">
				{#each t.reservations as r, i (i)}
					<dt>Reservation</dt>
					<dd>{r.serviceId}{r.coach ? ` · coach ${r.coach}` : ''}{r.seat ? ` · seat ${r.seat}` : ''}</dd>
				{/each}
			</dl>
		{/if}
	{:else if rc}
		<p class="caveat">Data may be incomplete, railcards use a separate standard.</p>
		<dl class="fields">
			<dt>Railcard</dt>
			<dd>{rc.railcardTypeName} <code>{rc.railcardNumber}</code></dd>
			<dt>Holder</dt>
			<dd>{rc.passenger1}{rc.passenger2 ? ` & ${rc.passenger2}` : ''}</dd>
			<dt>Valid</dt>
			<dd>{fmtDate(rc.startDate)} – {fmtDate(rc.endDate)}</dd>
			<dt>Purchased</dt>
			<dd>{fmtDate(rc.purchaseDate)}</dd>
			{#if rc.freeUse}<dt>Notes</dt>
				<dd class="small">{rc.freeUse}</dd>{/if}
		</dl>
	{/if}

	<dl class="fields divider">
		<dt>Ticket ref</dt>
		<dd><code>{ticket.ticketRef}</code></dd>
		<dt>Issuer</dt>
		<dd>RSP issuer {ticket.issuerId}</dd>
	</dl>
</div>

<style>
	.rsp {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--signal-red);
	}
	.crs {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--ink-soft);
		margin-left: 0.35rem;
		vertical-align: 0.15em;
	}
	.caveat {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.small {
		font-size: 0.8rem;
	}
</style>
