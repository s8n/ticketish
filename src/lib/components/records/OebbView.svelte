<script lang="ts">
	import type { OebbRecord } from '../../tickets/records/oebb.ts';
	import { fmtVienna } from '../../tickets/records/oebb.ts';

	let { data }: { data: OebbRecord } = $props();
</script>

<dl>
	{#if data.validFrom}
		<dt>Valid from</dt>
		<dd>{fmtVienna(data.validFrom)} <span class="soft">von</span></dd>
	{/if}
	{#if data.validUntil}
		<dt>Valid until</dt>
		<dd>{fmtVienna(data.validUntil)} <span class="soft">bis</span></dd>
	{/if}
	{#each Object.entries(data.extra) as [key, value] (key)}
		<dt>{key}</dt>
		<dd>{value}</dd>
	{/each}
</dl>
<p class="note">Times are shown in Austrian local time; the record stores them as UTC.</p>

<style>
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
		font-size: 0.8rem;
	}
	.note {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
</style>
