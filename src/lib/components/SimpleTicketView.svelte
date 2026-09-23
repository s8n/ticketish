<script lang="ts" module>
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * One label and value. A row whose value is null, undefined or empty is
	 * left out, so a view can list every field and let the ticket decide.
	 * `code` sets the value in the monospaced face, for references and
	 * numbers someone may need to read out or type.
	 */
	export type Row = [label: string, value: string | null | undefined, style?: 'code'];
</script>

<script lang="ts">
	/**
	 * Shared presentation for the smaller national formats: an optional route
	 * line, a label/value list, an optional note about undecoded fields, and
	 * the undecoded bytes themselves where a format has only been partly read.
	 */
	import RouteLine from './RouteLine.svelte';

	let {
		title,
		badge = null,
		from = null,
		to = null,
		fromTitle = null,
		toTitle = null,
		rows,
		note = null,
		undecoded = null
	}: {
		title: string;
		/** A word beside the title, for a variant the reader should know about. */
		badge?: string | null;
		from?: string | null;
		to?: string | null;
		/** Shown on hover over each station, typically the code it was read from. */
		fromTitle?: string | null;
		toTitle?: string | null;
		rows: Row[];
		note?: string | null;
		/** The bytes nothing has been found in yet, under a label saying what they are. */
		undecoded?: { label: string; hex: string } | null;
	} = $props();

	const visible = $derived(rows.filter(([, v]) => v !== null && v !== undefined && v !== ''));
</script>

<div class="simple">
	<header>
		<span class="product">{title}</span>
		{#if badge}<span class="badge">{badge}</span>{/if}
	</header>

	{#if from || to}
		<RouteLine {from} {to} {fromTitle} {toTitle} size="sm" />
	{/if}

	<dl class="fields">
		{#each visible as [label, value, style] (label)}
			<dt>{label}</dt>
			<dd>{#if style === 'code'}<code>{value}</code>{:else}{value}{/if}</dd>
		{/each}
	</dl>

	{#if note}
		<p class="note">{note}</p>
	{/if}
</div>

{#if undecoded}
	<details class="raw readout">
		<summary>{undecoded.label} ({undecoded.hex.length / 2} bytes)</summary>
		<code class="hex">{undecoded.hex}</code>
	</details>
{/if}

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
	.badge {
		color: var(--ink-soft);
	}
	.raw {
		margin-top: 0.7rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
	.hex {
		display: block;
		margin-top: 0.4rem;
		font-size: 0.72rem;
		line-height: 1.5;
		word-break: break-all;
		color: var(--ink-soft);
	}
</style>
