<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { SsbEnvelope, SsbOneTicketFlags, SsbStation } from '../tickets/ssb/ssb.ts';
	import { fmtDate } from '../tickets/format.ts';
	import { loadIssuerNames, ricsName, type IssuerTables } from '../tickets/uic/rics.ts';
	import { uicCountryName } from '../tickets/countries.ts';
	import { loadUicStations, uicStationName, type StationTable } from '../tickets/stations.ts';
	import RouteLine from './RouteLine.svelte';

	let { envelope }: { envelope: SsbEnvelope } = $props();

	// Only some records number their stations by UIC; the table loads on demand
	// and the raw code shows until it lands.
	let stations = $state<StationTable | null>(null);
	$effect(() => {
		loadUicStations().then((s) => (stations = s));
	});

	// The issuer is a company code, and the card header resolves the same one:
	// without the tables here the two would disagree on one ticket, which reads
	// as a parsing bug rather than as a table that had not loaded.
	let issuerNames = $state<IssuerTables | null>(null);
	$effect(() => {
		loadIssuerNames().then((n) => (issuerNames = n));
	});

	const r = $derived(envelope.data);
	const travelClass = $derived(
		r && 'travelClass' in r
			? r.travelClass === 1
				? '1st class'
				: r.travelClass === 2
					? '2nd class'
					: null
			: null
	);

	function stationLabel(s: SsbStation): string {
		if (s.type === 'uic') return uicStationName(stations, s.value) ?? `UIC ${s.value}`;
		if (s.type === 'benerail') return `${s.value} (Benerail)`;
		if (s.type === 'other') return `code ${s.value}`;
		return s.value;
	}

	/** The checks a OneTicket asks an inspector to make. */
	function oneTicketChecks(f: SsbOneTicketFlags): string[] {
		return [
			f.checkPassengerId ? 'passenger ID' : null,
			f.checkPassengerRailPass ? 'rail pass' : null,
			f.checkFareDiscounts ? 'fare discount' : null,
			f.checkInCard ? 'check-in card' : null,
			f.securePaper ? 'secure paper' : null,
			f.zoneTravelDocument ? 'zone travel document' : null,
			f.containsZoneComponent ? 'zone component' : null,
			f.additionalPaymentTicket ? 'additional payment' : null,
			f.reservationOnlyTicket ? 'reservation only' : null
		].filter((x): x is string => x !== null);
	}

	function travelers(adults: number, children: number): string {
		return [
			`${adults} adult${adults === 1 ? '' : 's'}`,
			children ? `${children} child${children === 1 ? '' : 'ren'}` : null
		]
			.filter(Boolean)
			.join(', ');
	}
</script>

<div class="ssb">
	{#if r}
		<header>
			<span class="product">
				{#if r.kind === 'ns-keycard'}{r.productName}
				{:else if r.kind === 'reservation'}Reservation
				{:else if r.kind === 'non-reservation'}Travel ticket
				{:else if r.kind === 'group'}Group ticket
				{:else if r.kind === 'cd-oneticket'}OneTicket
				{:else}Pass{/if}
			</span>
			{#if travelClass}<span class="chip">{travelClass}</span>{/if}
			{#if r.specimen}<span class="chip specimen">Specimen</span>{/if}
		</header>

		{#if r.kind !== 'ns-keycard' && r.kind !== 'pass' && r.kind !== 'cd-oneticket'}
			<RouteLine
				from={stationLabel(r.departureStation)}
				to={stationLabel(r.arrivalStation)}
				size="sm"
			/>
		{/if}

		<dl class="fields">
			{#if r.kind === 'ns-keycard'}
				<dt>Card number</dt>
				<dd><code>{r.cardId}</code></dd>
				<dt>Valid</dt>
				<dd>{fmtDate(r.validityStart)} – {fmtDate(r.validityEnd)}</dd>
				<dt>Issued</dt>
				<dd>{fmtDate(r.issuingDate)}</dd>
				<dt>Travelers</dt>
				<dd>{travelers(r.numAdults, r.numChildren)}</dd>
				{#if r.numTravelDays}<dt>Travel days</dt>
					<dd>{r.numTravelDays}</dd>{/if}
				{#if r.stationUic}<dt>Station</dt>
					<dd>{uicStationName(stations, r.stationUic) ?? `UIC ${r.stationUic}`}</dd>{/if}
			{:else}
				{#if r.kind === 'reservation'}
					<dt>Departure</dt>
					<dd>{fmtDate(r.departure)}</dd>
					<dt>Train</dt>
					<dd>
						{r.trainNumber || '?'}
						{#if r.coachNumber}· coach {r.coachNumber}{/if}
						{#if r.seatNumber}· seat {r.seatNumber}{/if}
						{#if r.overbooked}<span class="warn">· overbooked</span>{/if}
					</dd>
				{:else}
					<dt>Valid</dt>
					<dd>{fmtDate(r.validityStart)} – {fmtDate(r.validityEnd)}</dd>
				{/if}
				{#if r.kind === 'pass'}
					{#if r.travelDays}<dt>Travel days</dt>
						<dd>{r.travelDays}</dd>{/if}
					{#if r.countries.length}
						<dt>Countries</dt>
						<dd>{r.countries.map((c) => uicCountryName(c)).join(', ')}</dd>
					{/if}
				{/if}
				{#if r.kind === 'group'}
					{#if r.groupLeader}<dt>Group leader</dt>
						<dd>{r.groupLeader}</dd>{/if}
					{#if r.countermark}<dt>Countermark</dt>
						<dd>{r.countermark}</dd>{/if}
				{/if}
				{#if r.kind === 'cd-oneticket'}
					{@const checks = oneTicketChecks(r.flags)}
					{#if checks.length}
						<dt>Inspection</dt>
						<dd>{checks.join(', ')}</dd>
					{/if}
				{/if}
				{#if (r.kind === 'non-reservation' || r.kind === 'group' || r.kind === 'cd-oneticket') && r.returnIncluded}
					<dt>Return</dt>
					<dd>Included</dd>
				{/if}
				<dt>Travelers</dt>
				<dd>{travelers(r.numAdults, r.numChildren)}</dd>
				{#if r.pnr}<dt>{r.kind === 'cd-oneticket' ? 'SJT number' : 'Reference'}</dt>
					<dd><code>{r.pnr}</code></dd>{/if}
				<dt>Issued</dt>
				<dd>{fmtDate(r.issuingDate)}</dd>
			{/if}
			{#if 'extraText' in r && r.extraText}
				<dt>Notes</dt>
				<dd class="small">{r.extraText}</dd>
			{/if}
		</dl>

		{#if r.kind === 'cd-oneticket'}
			<p class="note">
				The OneTicket record carries no station codes this parser can place, so the route is on
				the ticket face only.
			</p>
		{/if}
	{:else}
		<p class="note">{envelope.unsupported ?? 'This SSB ticket type is not decoded yet.'}</p>
		<details class="readout">
			<summary>Raw body ({envelope.bodyHex.length / 2} bytes)</summary>
			<code class="hex">{envelope.bodyHex}</code>
		</details>
	{/if}

	<dl class="fields divider">
		<dt>Ticket type</dt>
		<dd>{envelope.ticketTypeName} <span class="soft">({envelope.ticketType})</span></dd>
		<dt>Issuer</dt>
		<dd>{ricsName(envelope.issuerRics, issuerNames) ?? `RICS ${envelope.issuerRics}`}</dd>
	</dl>
</div>

<style>
	.ssb {
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
	/* A shade larger than the shared one: an SSB record carries little else. */
	.product {
		font-size: 1.25rem;
	}
	.chip {
		color: var(--rail-blue);
	}
	.chip.specimen {
		color: var(--signal-red);
	}
	dd.small {
		font-size: 0.8rem;
	}
	.warn {
		color: var(--signal-red);
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	summary {
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.hex {
		font-size: 0.72rem;
		word-break: break-all;
		display: block;
		margin-top: 0.3rem;
	}
</style>
