<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import JsonTree from './JsonTree.svelte';

	let { value, label = null }: { value: unknown; label?: string | null } = $props();

	const isChoice = (v: unknown): v is { __choice__: string; value: unknown } =>
		!!v && typeof v === 'object' && '__choice__' in v;

	const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
</script>

{#if value instanceof Uint8Array}
	<div class="row"><span class="key">{label}</span><code class="hex">{hex(value)}</code></div>
{:else if isChoice(value)}
	<details open>
		<summary><span class="key">{label ?? ''}</span> <span class="choice">{value.__choice__}</span></summary>
		<div class="indent"><JsonTree value={value.value} /></div>
	</details>
{:else if Array.isArray(value)}
	<details open={value.length <= 4}>
		<summary><span class="key">{label ?? ''}</span> <span class="meta">[{value.length}]</span></summary>
		<div class="indent">
			{#each value as item, i (i)}
				<JsonTree value={item} label={String(i)} />
			{/each}
		</div>
	</details>
{:else if value && typeof value === 'object'}
	{#if label !== null}
		<details open>
			<summary><span class="key">{label}</span></summary>
			<div class="indent">
				{#each Object.entries(value) as [k, v] (k)}
					<JsonTree value={v} label={k} />
				{/each}
			</div>
		</details>
	{:else}
		{#each Object.entries(value) as [k, v] (k)}
			<JsonTree value={v} label={k} />
		{/each}
	{/if}
{:else}
	<div class="row">
		<span class="key">{label}</span>
		<span class="val" class:bool={typeof value === 'boolean'} class:num={typeof value === 'number'}
			>{String(value)}</span
		>
	</div>
{/if}

<style>
	.row,
	summary {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.6;
	}
	summary {
		cursor: pointer;
		list-style-position: outside;
	}
	.indent {
		padding-left: 1.1rem;
		border-left: 1px dotted var(--paper-edge);
	}
	.key {
		color: var(--ink-soft);
	}
	.key:not(:empty)::after {
		content: ':';
	}
	.choice {
		color: var(--rail-blue);
		font-weight: 600;
	}
	.meta {
		color: var(--ink-soft);
	}
	.val {
		color: var(--ink);
	}
	.val.num {
		color: var(--rail-blue);
	}
	.val.bool {
		color: var(--valid-green);
	}
	.hex {
		word-break: break-all;
		color: var(--ink);
	}
</style>
