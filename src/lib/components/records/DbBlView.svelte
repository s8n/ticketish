<script lang="ts">
	import type { DbBlData } from '../../tickets/records/dbbl.ts';
	import { fmtDate } from '../../tickets/format.ts';

	let { data }: { data: DbBlData } = $props();

	const passengers = $derived(
		[
			data.numAdults ? `${data.numAdults} adult${data.numAdults > 1 ? 's' : ''}` : null,
			data.numChildren ? `${data.numChildren} child${data.numChildren > 1 ? 'ren' : ''}` : null,
			data.numBahncards ? `${data.numBahncards}× ${data.bahncardType ?? 'BahnCard'}` : null
		]
			.filter(Boolean)
			.join(', ')
	);
</script>

<div class="bl">
	{#if data.fromStationName || data.toStationName}
		<div class="route">
			<span class="station">{data.fromStationName ?? '—'}</span>
			<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
			<span class="station">{data.toStationName ?? '—'}</span>
		</div>
	{/if}
	<dl>
		{#if data.product}<dt>Product</dt>
			<dd>{data.product}</dd>{/if}
		{#if data.serviceClass}<dt>Class</dt>
			<dd>{data.serviceClass === 'first' ? '1st class' : '2nd class'}</dd>{/if}
		{#if data.validityStart || data.validityEnd}
			<dt>Valid</dt>
			<dd>{fmtDate(data.validityStart)} – {fmtDate(data.validityEnd)}</dd>
		{/if}
		{#if data.route}<dt>Via</dt>
			<dd class="small">{data.route}</dd>{/if}
		{#if data.travellerFullName || data.travellerForename}
			<dt>Traveler</dt>
			<dd>{data.travellerFullName ?? `${data.travellerForename} ${data.travellerSurname ?? ''}`}</dd>
		{/if}
		{#if passengers}<dt>Passengers</dt>
			<dd>{passengers}</dd>{/if}
		{#if data.priceLevel}<dt>Fare</dt>
			<dd>{data.priceLevel}</dd>{/if}
		{#if data.returnFromStationName}
			<dt>Return</dt>
			<dd>{data.returnFromStationName} → {data.returnToStationName ?? '—'}</dd>
		{/if}
	</dl>
	{#if Object.keys(data.blocks).length}
		<details>
			<summary>Other S-blocks ({Object.keys(data.blocks).length})</summary>
			<dl class="mono">
				{#each Object.entries(data.blocks) as [k, v] (k)}
					<dt>{k}</dt>
					<dd>{v}</dd>
				{/each}
			</dl>
		</details>
	{/if}
</div>

<style>
	.bl {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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
	dd.small {
		font-size: 0.8rem;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		margin-top: 0.3rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
</style>
