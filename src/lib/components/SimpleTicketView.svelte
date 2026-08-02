<script lang="ts">
	/**
	 * Shared presentation for the smaller national formats: an optional route
	 * line, a label/value list, and an optional note about undecoded fields.
	 */
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
		<div class="route">
			<span class="station">{from ?? '–'}</span>
			<span class="line" aria-hidden="true"><span class="dot"></span><span class="rail"></span><span class="dot"></span></span>
			<span class="station">{to ?? '–'}</span>
		</div>
	{/if}

	<dl>
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
	.product {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.2rem;
		text-transform: uppercase;
	}
	.route {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: nowrap;
		overflow-x: auto;
	}
	.station {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.3rem;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.line {
		flex: 1;
		min-width: 3rem;
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
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.5rem;
	}
</style>
