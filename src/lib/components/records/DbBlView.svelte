<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { DbBlData } from '../../tickets/records/dbbl.ts';
	import { fmtDate } from '../../tickets/format.ts';
	import { loadUicStations, uicStationLabel, type StationTable } from '../../tickets/stations.ts';
	import RouteLine from '../RouteLine.svelte';

	let { data }: { data: DbBlData } = $props();

	// The S-blocks usually print the station names themselves. The UIC codes in
	// S035/S036 are the fallback for the tickets that leave them out.
	let uicStations = $state<StationTable | null>(null);
	$effect(() => {
		loadUicStations().then((s) => (uicStations = s));
	});

	const from = $derived(data.fromStationName ?? uicStationLabel(uicStations, data.fromStationUic));
	const to = $derived(data.toStationName ?? uicStationLabel(uicStations, data.toStationUic));

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
	{#if from || to}
		<RouteLine {from} {to} />
	{/if}
	<dl class="fields">
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
			<dd>{data.returnFromStationName} → {data.returnToStationName ?? '–'}</dd>
		{/if}
	</dl>
	{#if Object.keys(data.blocks).length}
		<details>
			<summary>Other S-blocks ({Object.keys(data.blocks).length})</summary>
			<dl class="fields mono">
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
