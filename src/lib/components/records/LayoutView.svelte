<script lang="ts">
	import type { LayoutData } from '../../tickets/records/utlay.ts';

	let { data }: { data: LayoutData } = $props();

	// RCT2 layouts address a 72-column grid; render faithfully in monospace.
	const columns = $derived(
		Math.max(72, ...data.fields.map((f) => f.column + Math.max(f.width, f.text.length)))
	);
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
				style:grid-column="{f.column + 1} / span {Math.max(f.width, 1)}"
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
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1ch);
		grid-auto-rows: 1.35em;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--ink);
		min-width: calc(var(--cols) * 1ch);
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
