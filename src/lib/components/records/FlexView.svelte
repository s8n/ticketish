<script lang="ts">
	import type { FlexData } from '../../tickets/records/uflex.ts';
	import { summarizeFcb, type FcbTicket, type Traveler } from '../../tickets/model.ts';
	import { docTypeLabel, fmtClass, fmtDate, fmtPrice } from '../../tickets/format.ts';
	import { ricsName } from '../../tickets/uic/rics.ts';
	import ZugbindungStrip from '../ZugbindungStrip.svelte';
	import JsonTree from '../JsonTree.svelte';

	let { data }: { data: FlexData } = $props();

	const ticket = $derived(data.ticket as FcbTicket);
	const issuing = $derived(ticket.issuingDetail);
	const docs = $derived(summarizeFcb(ticket));
	const travelers = $derived((ticket.travelerDetail?.traveler ?? []) as Traveler[]);
	const currency = $derived((issuing.currency as string) ?? 'EUR');
	const fract = $derived((issuing.currencyFract as number) ?? 2);

	function travelerName(t: Traveler): string {
		const name = [t.firstName, t.secondName, t.lastName].filter(Boolean).join(' ');
		return name || 'Traveler';
	}

	function stations(d: Record<string, unknown>): { from?: string; to?: string } {
		return {
			from: (d.fromStationNameUTF8 as string) ?? (d.fromStationIA5 as string),
			to: (d.toStationNameUTF8 as string) ?? (d.toStationIA5 as string)
		};
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
</script>

<div class="flex-view">
	{#each docs as doc, i (i)}
		{@const st = stations(doc.data)}
		<section class="doc">
			<header>
				<span class="doctype">{docTypeLabel(doc.type)}</span>
				{#if doc.data.productIdIA5}<span class="product">{doc.data.productIdIA5}</span>
				{:else if doc.data.trainIA5 || doc.data.trainNum}
					<span class="product">Train {doc.data.trainIA5 ?? doc.data.trainNum}</span>{/if}
				{#if fmtClass(doc.data.classCode as string)}<span class="chip">{fmtClass(doc.data.classCode as string)}</span>{/if}
			</header>

			{#if st.from || st.to}
				<div class="route">
					<span class="station">{st.from ?? '—'}</span>
					<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
					<span class="station">{st.to ?? '—'}</span>
				</div>
			{/if}

			{#if doc.trainBindings.length}
				<ZugbindungStrip bindings={doc.trainBindings} />
			{/if}

			<dl>
				{#if doc.validFrom}<dt>Valid from</dt>
					<dd>{fmtDate(doc.validFrom)}</dd>{/if}
				{#if doc.validUntil}<dt>Valid until</dt>
					<dd>{fmtDate(doc.validUntil)}</dd>{/if}
				{#if seats(doc.data)}<dt>Place</dt>
					<dd>{seats(doc.data)}</dd>{/if}
				{#if doc.data.validRegionDesc}<dt>Route</dt>
					<dd class="small">{doc.data.validRegionDesc}</dd>{/if}
				{#if doc.data.price !== undefined}<dt>Price</dt>
					<dd>{fmtPrice(doc.data.price as number, currency, fract)}</dd>{/if}
				{#if doc.data.infoText}<dt>Info</dt>
					<dd class="small">{doc.data.infoText}</dd>{/if}
			</dl>
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

	<dl class="issuing">
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
		{#if travelers.length}
			<dt>Traveler{travelers.length > 1 ? 's' : ''}</dt>
			<dd>
				{travelers
					.map((t) => travelerName(t) + (t.yearOfBirth ? ` (*${t.yearOfBirth})` : ''))
					.join(', ')}
			</dd>
		{/if}
		{#if issuing.specimen}<dt>Note</dt>
			<dd>Specimen ticket</dd>{/if}
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
	.product {
		font-weight: 600;
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
		font-size: 1.45rem;
		line-height: 1.1;
		text-transform: uppercase;
		letter-spacing: 0.02em;
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
		height: 0;
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
	dd.small {
		font-size: 0.8rem;
	}
	.tariffs {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}
	.issuing {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
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
