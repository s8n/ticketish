<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { LayoutData, LayoutField } from '../../tickets/records/utlay.ts';

	let { data }: { data: LayoutData } = $props();

	/**
	 * Rightmost column a field actually prints into. Declared widths are often
	 * far wider than the text in them, so measuring the text instead is what
	 * keeps the grid from trailing off into empty columns.
	 */
	function contentEnd(f: LayoutField): number {
		const longest = Math.max(0, ...f.text.split('\n').map((line) => line.trimEnd().length));
		return f.column + longest;
	}

	// RCT2 layouts address a 72-column grid, but few tickets fill it, so the
	// grid is cut to the last printed column and centred instead.
	const columns = $derived(Math.max(1, ...data.fields.map(contentEnd)));
	const rows = $derived(
		Math.max(...data.fields.map((f) => f.line + Math.max(f.height, f.text.split('\n').length)), 18)
	);
</script>

<div class="frame">
	<div class="grid" style:--cols={columns} style:--rows={rows}>
		{#each data.fields as f, i (i)}
			<div
				class="field"
				class:bold={f.bold}
				class:italic={f.italic}
				class:small={f.smallFont}
				style:grid-column="{f.column + 1} / span {Math.max(
					Math.min(f.width, columns - f.column),
					1
				)}"
				style:grid-row="{f.line + 1} / span {Math.max(f.height, f.text.split('\n').length, 1)}"
			>{f.text}</div>
		{/each}
	</div>
</div>
<p class="standard">Layout standard: <code>{data.standard}</code></p>

<style>
	.frame {
		overflow-x: auto;
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		background: color-mix(in srgb, var(--paper-hi) 60%, white 40%);
		padding: 0.6rem;
		/* hug the printed area rather than stretching past its last column,
		   staying left aligned with the rest of the card; a layout too wide to
		   fit fills the row and scrolls instead */
		width: max-content;
		max-width: 100%;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1ch);
		grid-auto-rows: 1.35em;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--ink);
		width: max-content;
	}
	.field {
		white-space: pre;
		overflow: visible;
	}
	.bold {
		font-weight: 600;
	}
	.italic {
		font-style: italic;
	}
	.small {
		font-size: 0.62rem;
	}
	.standard {
		font-size: 0.78rem;
		color: var(--ink-soft);
		margin: 0.4rem 0 0;
	}
</style>
