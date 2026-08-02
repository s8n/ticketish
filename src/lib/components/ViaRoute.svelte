<script lang="ts">
	import ViaRoute from './ViaRoute.svelte';
	import type { ViaCarrier, ViaItem } from '../tickets/via.ts';

	let {
		route = null,
		items = null,
		nested = false
	}: { route?: ViaCarrier[] | null; items?: ViaItem[] | null; nested?: boolean } = $props();
</script>

{#if route}
	<div class="via" class:nested>
		{#each route as carrier, ci (ci)}
			<div class="carrier">
				{#if carrier.carriers.length}
					<span class="carrier-label">
						{carrier.carriers.map((c) => c.name ?? `RICS ${c.code}`).join(', ')}
					</span>
				{/if}
				<div class="chain">
					{#each carrier.items as item, i (i)}
						{#if i > 0}<span class="link" aria-hidden="true"></span>{/if}
						{#if item.kind === 'point'}
							<span class="stop" title={item.name ? item.code : undefined}
								>{item.name ?? item.code}</span
							>
						{:else}
							<div class="options">
								{#each item.choices as choice, oi (oi)}
									<div class="choice">
										<span class="link" aria-hidden="true"></span>
										<ViaRoute items={choice} nested />
										<span class="link" aria-hidden="true"></span>
									</div>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{:else if items}
	<div class="chain">
		{#each items as item, i (i)}
			{#if i > 0}<span class="link" aria-hidden="true"></span>{/if}
			{#if item.kind === 'point'}
				<span class="stop" title={item.name ? item.code : undefined}>{item.name ?? item.code}</span>
			{:else}
				<div class="options">
					{#each item.choices as choice, oi (oi)}
						<div class="choice">
							<span class="link" aria-hidden="true"></span>
							<ViaRoute items={choice} nested />
							<span class="link" aria-hidden="true"></span>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	/* One horizontal band; on narrow screens it scrolls (swipes) sideways
	   instead of wrapping, so the route stays readable left to right. */
	.via {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.6rem 1.2rem;
		overflow-x: auto;
		padding: 0.1rem 0 0.35rem;
		max-width: 100%;
		scrollbar-width: thin;
	}
	.carrier {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.carrier-label {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.68rem;
		color: var(--ink-soft);
	}
	.chain {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
	}
	.stop {
		font-size: 0.78rem;
		line-height: 1.2;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: color-mix(in srgb, var(--paper-hi) 60%, white 40%);
		white-space: nowrap;
	}
	.link {
		display: inline-block;
		width: 0.7rem;
		height: 0;
		border-top: 2px solid var(--paper-edge);
		flex: none;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-left: 2px solid var(--paper-edge);
		border-right: 2px solid var(--paper-edge);
		border-radius: 6px;
		padding: 0.15rem 0;
	}
	.choice {
		display: flex;
		align-items: center;
	}
</style>
