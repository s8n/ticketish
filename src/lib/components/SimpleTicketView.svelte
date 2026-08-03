<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * Shared presentation for the smaller national formats: an optional route
	 * line, a label/value list, and an optional note about undecoded fields.
	 */
	import RouteLine from './RouteLine.svelte';

	let {
		title,
		from = null,
		to = null,
		rows,
		note = null
	}: {
		title: string;
		from?: string | null;
		to?: string | null;
		rows: [string, string | null | undefined][];
		note?: string | null;
	} = $props();

	const visible = $derived(rows.filter(([, v]) => v !== null && v !== undefined && v !== ''));
</script>

<div class="simple">
	<header><span class="product">{title}</span></header>

	{#if from || to}
		<RouteLine {from} {to} size="sm" />
	{/if}

	<dl class="fields">
		{#each visible as [label, value] (label)}
			<dt>{label}</dt>
			<dd>{value}</dd>
		{/each}
	</dl>

	{#if note}
		<p class="note">{note}</p>
	{/if}
</div>

<style>
	.simple {
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
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.5rem;
	}
</style>
