<script lang="ts">
	import { onMount } from 'svelte';
	import type { Rsp6Ticket, Rsp6TicketData, Rsp6RailcardData } from '../tickets/rsp/rsp6.ts';
	import { fmtDate } from '../tickets/format.ts';
	import { loadNlcNames, nlcEntry, nlcLabel, type NlcEntry } from '../tickets/rsp/nlc.ts';

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
		<div class="route">
			<span class="station" title={t.originNlc ? `NLC ${t.originNlc}` : undefined}>
				{station(t.originNlc)}{#if crs(t.originNlc)}<span class="crs">{crs(t.originNlc)}</span>{/if}
			</span>
			<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
			<span class="station" title={t.destinationNlc ? `NLC ${t.destinationNlc}` : undefined}>
				{station(t.destinationNlc)}{#if crs(t.destinationNlc)}<span class="crs">{crs(t.destinationNlc)}</span>{/if}
			</span>
		</div>
		<dl>
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
			<dl>
				{#each t.reservations as r, i (i)}
					<dt>Reservation</dt>
					<dd>{r.serviceId}{r.coach ? ` · coach ${r.coach}` : ''}{r.seat ? ` · seat ${r.seat}` : ''}</dd>
				{/each}
			</dl>
		{/if}
	{:else if rc}
		<dl>
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

	<dl class="envelope-info">
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
	.crs {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--ink-soft);
		margin-left: 0.35rem;
		vertical-align: 0.15em;
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
	.small {
		font-size: 0.8rem;
	}
	.envelope-info {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
	}
</style>
