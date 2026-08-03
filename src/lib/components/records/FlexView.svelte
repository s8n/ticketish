<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { FlexData } from '../../tickets/records/uflex.ts';
	import { summarizeFcb, type FcbTicket, type Traveler } from '../../tickets/model.ts';
	import { docTypeLabel, fmtClass, fmtDate, fmtPrice } from '../../tickets/format.ts';
	import { ricsName } from '../../tickets/uic/rics.ts';
	import { parseDbVia } from '../../tickets/via.ts';
	import { uicCountryName, isoNumericCountryName } from '../../tickets/countries.ts';
	import {
		isUicCodeTable,
		loadUicStations,
		uicStationLabel,
		type StationTable
	} from '../../tickets/stations.ts';
	import ZugbindungStrip from '../ZugbindungStrip.svelte';
	import RouteLine from '../RouteLine.svelte';
	import ViaRoute from '../ViaRoute.svelte';
	import JsonTree from '../JsonTree.svelte';

	let { data }: { data: FlexData } = $props();

	const ticket = $derived(data.ticket as FcbTicket);
	const issuing = $derived(ticket.issuingDetail);

	// Loads on demand: until it lands the numeric codes show, the way they did
	// before the table existed.
	let uicStations = $state<StationTable | null>(null);
	$effect(() => {
		loadUicStations().then((s) => (uicStations = s));
	});

	const docs = $derived(summarizeFcb(ticket, uicStations));
	const travelers = $derived((ticket.travelerDetail?.traveler ?? []) as Traveler[]);
	const control = $derived(ticket.controlDetail as Record<string, unknown> | undefined);
	const currency = $derived((issuing.currency as string) ?? 'EUR');
	const fract = $derived((issuing.currencyFract as number) ?? 2);

	function travelerName(t: Traveler): string {
		const name = [t.firstName, t.secondName, t.lastName].filter(Boolean).join(' ');
		return name || 'Traveler';
	}

	function birthDate(t: Traveler): string | null {
		if (t.yearOfBirth === undefined) return null;
		if (t.monthOfBirth !== undefined && t.dayOfBirthInMonth !== undefined) {
			return fmtDate(
				`${t.yearOfBirth}-${String(t.monthOfBirth).padStart(2, '0')}-${String(t.dayOfBirthInMonth).padStart(2, '0')}`
			);
		}
		return String(t.yearOfBirth);
	}

	function tariffsOf(d: Record<string, unknown>): Record<string, unknown>[] {
		return (d.tariffs as Record<string, unknown>[]) ?? [];
	}

	function cardsOf(t: Record<string, unknown>): Record<string, unknown>[] {
		return (t.reductionCard as Record<string, unknown>[]) ?? [];
	}

	function seats(d: Record<string, unknown>): string | null {
		const places = d.places as { coach?: string; placeIA5?: string[]; placeNum?: number[] } | undefined;
		if (!places) return null;
		const nums = places.placeIA5?.length ? places.placeIA5 : places.placeNum?.map(String);
		if (!places.coach && !nums?.length) return null;
		return [places.coach ? `coach ${places.coach}` : null, nums?.length ? `seat ${nums.join(', ')}` : null]
			.filter(Boolean)
			.join(' · ');
	}

	function stations(d: Record<string, unknown>): { from?: string; to?: string } {
		// Only the UIC code tables can be named; a carrier's or issuer's own
		// numbering would resolve to the wrong station.
		const uic = isUicCodeTable(d.stationCodeTable as string | undefined);
		const named = (num: unknown) =>
			uic ? (uicStationLabel(uicStations, num as number) ?? undefined) : undefined;
		return {
			from:
				(d.fromStationNameUTF8 as string) ??
				(d.fromStationIA5 as string) ??
				named(d.fromStationNum),
			to: (d.toStationNameUTF8 as string) ?? (d.toStationIA5 as string) ?? named(d.toStationNum)
		};
	}

	function productName(type: string, d: Record<string, unknown>): string | null {
		if (type === 'pass') return (d.passDescription as string) ?? (d.productIdIA5 as string) ?? null;
		if (type === 'customerCard')
			return (d.cardTypeDescr as string) ?? (d.productIdIA5 as string) ?? null;
		return (d.productIdIA5 as string) ?? null;
	}

	/** Card numbers are printed in groups of four, so show them that way. */
	function cardNumber(d: Record<string, unknown>): string | null {
		const id = (d.cardIdIA5 as string) ?? (d.cardIdNum !== undefined ? String(d.cardIdNum) : null);
		if (!id) return null;
		return /^\d{8,}$/.test(id) ? (id.match(/.{1,4}/g)?.join(' ') ?? id) : id;
	}

	/** Named card status if the issuer gave one, otherwise its code. */
	function cardStatus(d: Record<string, unknown>): string | null {
		const named = d.customerStatusDescr as string | undefined;
		if (named) return named;
		const code = d.customerStatus as number | undefined;
		const map: Record<number, string> = {
			1: 'basic',
			2: 'premium',
			3: 'silver',
			4: 'gold',
			5: 'platinum',
			6: 'senator'
		};
		if (code === undefined) return null;
		return map[code] ?? `status ${code}`;
	}

	/** The card holder, when they are not already listed among the travelers. */
	function cardHolder(d: Record<string, unknown>): string | null {
		const customer = d.customer as Traveler | undefined;
		if (!customer) return null;
		const name = travelerName(customer);
		return travelers.some((t) => travelerName(t) === name) ? null : name;
	}

	function activatedDays(d: Record<string, unknown>, validFrom?: string): string[] {
		const days = d.activatedDay as number[] | undefined;
		if (!days?.length || !validFrom) return [];
		const base = new Date(`${validFrom.slice(0, 10)}T00:00:00Z`);
		return days.map((offset) => {
			const day = new Date(base);
			day.setUTCDate(day.getUTCDate() + offset);
			return fmtDate(day.toISOString().slice(0, 10));
		});
	}

	function countriesOf(d: Record<string, unknown>): number[] {
		return (d.countries as number[]) ?? [];
	}

	function carrierList(d: Record<string, unknown>): string[] {
		const nums = (d.includedCarrierNum as number[]) ?? [];
		const ia5 = (d.includedCarrierIA5 as string[]) ?? [];
		return [
			...nums.map((n) => ricsName(n) ?? `RICS ${n}`),
			...ia5
		];
	}

	const CONTROL_LABELS: Record<string, string> = {
		identificationByIdCard: 'ID card required at inspection',
		identificationByPassportId: 'Passport required at inspection',
		passportValidationRequired: 'Passport validation required',
		onlineValidationRequired: 'Online validation required',
		ageCheckRequired: 'Age check required',
		reductionCardCheckRequired: 'Reduction card check required',
		identificationItem: 'Identification item'
	};
</script>

<div class="flex-view">
	{#each docs as doc, i (i)}
		{@const st = stations(doc.data)}
		{@const via = parseDbVia((doc.data.validRegionDesc as string) ?? '')}
		{@const activated = activatedDays(doc.data, doc.validFrom)}
		{@const carriers = carrierList(doc.data)}
		<section class="doc">
			<header>
				<span class="doctype">{docTypeLabel(doc.type)}</span>
				{#if productName(doc.type, doc.data)}
					<span class="product-sm">{productName(doc.type, doc.data)}</span>
				{:else if doc.data.trainIA5 || doc.data.trainNum}
					<span class="product-sm">Train {doc.data.trainIA5 ?? doc.data.trainNum}</span>{/if}
				{#if fmtClass(doc.data.classCode as string)}<span class="chip">{fmtClass(doc.data.classCode as string)}</span>{/if}
			</header>

			{#if st.from || st.to}
				<RouteLine from={st.from} to={st.to} />
			{/if}

			{#if doc.trainBindings.length}
				<!-- The bound route belongs with the trains, so it moves inside the stamp. -->
				<ZugbindungStrip
					bindings={doc.trainBindings}
					{via}
					viaTitle={doc.data.validRegionDesc as string}
				/>
			{:else if via}
				<div class="via-block" title={doc.data.validRegionDesc as string}>
					<span class="via-label">Via</span>
					<ViaRoute route={via} />
				</div>
			{/if}

			<dl class="fields">
				{#if doc.validFrom}<dt>Valid from</dt>
					<dd>{fmtDate(doc.validFrom)}</dd>{/if}
				{#if doc.validUntil}<dt>Valid until</dt>
					<dd>{fmtDate(doc.validUntil)}</dd>{/if}
				{#if cardHolder(doc.data)}<dt>Card holder</dt>
					<dd>{cardHolder(doc.data)}</dd>{/if}
				{#if cardNumber(doc.data)}<dt>Card number</dt>
					<dd><code>{cardNumber(doc.data)}</code></dd>{/if}
				{#if cardStatus(doc.data)}<dt>Status</dt>
					<dd>{cardStatus(doc.data)}</dd>{/if}
				{#if activated.length}
					<dt>Activated day{activated.length > 1 ? 's' : ''}</dt>
					<dd>{activated.join(', ')}</dd>
				{/if}
				{#if seats(doc.data)}<dt>Place</dt>
					<dd>{seats(doc.data)}</dd>{/if}
				{#if !via && doc.data.validRegionDesc}<dt>Route</dt>
					<dd class="small">{doc.data.validRegionDesc}</dd>{/if}
				{#if doc.data.price !== undefined}<dt>Price</dt>
					<dd>{fmtPrice(doc.data.price as number, currency, fract)}</dd>{/if}
				{#if carriers.length}
					<dt>Carrier{carriers.length > 1 ? 's' : ''}</dt>
					<dd>{carriers.join(', ')}</dd>
				{/if}
				{#if doc.data.infoText}<dt>Info</dt>
					<dd class="small">{doc.data.infoText}</dd>{/if}
			</dl>

			{#if countriesOf(doc.data).length}
				<div class="countries">
					{#each countriesOf(doc.data) as c (c)}
						<span class="country">{uicCountryName(c)}</span>
					{/each}
				</div>
			{/if}

			{#if tariffsOf(doc.data).length}
				<ul class="tariffs">
					{#each tariffsOf(doc.data) as tariff, ti (ti)}
						<li>
							{tariff.numberOfPassengers ?? 1}× {tariff.tariffDesc ?? tariff.passengerType ?? 'tariff'}
							{#each cardsOf(tariff) as card, ci (ci)}
								· {card.cardName ?? 'reduction card'}
							{/each}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}

	{#if travelers.length}
		<section class="travelers">
			<h4 class="block-title">Traveler{travelers.length > 1 ? 's' : ''}</h4>
			{#each travelers as t, i (i)}
				<dl class="fields">
					<dt>Name</dt>
					<dd>
						{travelerName(t)}
						{#if t.ticketHolder}<span class="chip holder">ticket holder</span>{/if}
					</dd>
					{#if birthDate(t)}<dt>Born</dt>
						<dd>{birthDate(t)}</dd>{/if}
					{#if t.passengerType}<dt>Type</dt>
						<dd>{t.passengerType}</dd>{/if}
					{#if t.passportId}<dt>Passport</dt>
						<dd><code>{t.passportId}</code></dd>{/if}
					{#if t.idCard}<dt>ID card</dt>
						<dd><code>{t.idCard}</code></dd>{/if}
					{#if t.countryOfResidence}
						<dt>Residence</dt>
						<dd>{isoNumericCountryName(t.countryOfResidence as number)}</dd>
					{/if}
				</dl>
			{/each}
		</section>
	{/if}

	{#if control}
		{@const flags = Object.entries(CONTROL_LABELS).filter(([k]) => control[k] === true)}
		{#if flags.length || control.infoText}
			<section class="control">
				<h4 class="block-title">Inspection</h4>
				{#if flags.length}
					<ul>
						{#each flags as [k, label] (k)}
							<li>{label}</li>
						{/each}
					</ul>
				{/if}
				{#if control.infoText}<p class="small">{control.infoText}</p>{/if}
			</section>
		{/if}
	{/if}

	<dl class="fields divider">
		<dt>Issuer</dt>
		<dd>
			{issuing.issuerName ??
				ricsName(issuing.issuerNum ?? issuing.securityProviderNum) ??
				issuing.issuerNum ??
				'unknown'}
		</dd>
		{#if issuing.issuerPNR}<dt>Booking ref</dt>
			<dd><code>{issuing.issuerPNR}</code></dd>{/if}
		<dt>Issued</dt>
		<dd>
			{fmtDate(
				new Date(Date.UTC(issuing.issuingYear, 0, issuing.issuingDay)).toISOString().slice(0, 10)
			)}
		</dd>
		{#if issuing.securePaperTicket}<dt>Medium</dt>
			<dd>Secure paper ticket</dd>{/if}
	</dl>

	<details class="alldata">
		<summary>All decoded data (FCB v{data.fcbVersion})</summary>
		<div class="tree"><JsonTree value={ticket} /></div>
	</details>
</div>

<style>
	.flex-view {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.doc {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.doc > header {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.doctype {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.product-sm {
		font-weight: 600;
	}
	.chip {
		color: var(--rail-blue);
	}
	.via-block {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
	}
	/* let the route band shrink inside the flex row so it scrolls instead of
	   forcing the card wider */
	.via-block > :global(.via) {
		min-width: 0;
		flex: 1;
	}
	.via-label {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.78rem;
		color: var(--ink-soft);
		padding-top: 0.2rem;
	}
	dd.small,
	p.small {
		font-size: 0.8rem;
	}
	.countries {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.country {
		font-size: 0.75rem;
		padding: 0.08rem 0.45rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		color: var(--ink-soft);
	}
	.tariffs {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}
	.travelers,
	.control {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.holder {
		font-size: 0.68rem;
		margin-left: 0.4rem;
	}
	.control ul {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}
	.control p {
		margin: 0;
	}
	.alldata summary {
		cursor: pointer;
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
	.tree {
		margin-top: 0.4rem;
		max-height: 24rem;
		overflow: auto;
	}
</style>
