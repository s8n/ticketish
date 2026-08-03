<script lang="ts">
	import type { TrainBinding } from '../tickets/model.ts';
	import type { ViaCarrier } from '../tickets/via.ts';
	import { fmtDate } from '../tickets/format.ts';
	import ViaRoute from './ViaRoute.svelte';

	let {
		bindings,
		via = null,
		viaTitle = undefined
	}: { bindings: TrainBinding[]; via?: ViaCarrier[] | null; viaTitle?: string } = $props();
</script>

<!-- The red overprint stamp: the deciphered Zugbindung. The bound route
     belongs with the trains it binds, so the via map sits inside. -->
<div class="stamp" role="note" aria-label="Zugbindung - ticket bound to specific trains">
	<span class="title">Zugbindung</span>
	<div class="body">
		<ul>
			{#each bindings as b, i (i)}
				<li>
					<strong class="train">{b.train}</strong>
					<span class="when">{fmtDate(b.departureDate)} · dep {b.departureTime}</span>
					{#if b.fromStation || b.toStation}
						<span class="route">{b.fromStation ?? '?'} → {b.toStation ?? '?'}</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if via}
			<div class="via-row" title={viaTitle}>
				<span class="via-label">Via</span>
				<ViaRoute route={via} tone="stamp" />
			</div>
		{/if}
	</div>
</div>

<style>
	/* The whole stamp scrolls, label included, so swiping left reclaims that
	   width and shows more of the route. */
	.stamp {
		border: 2px solid var(--signal-red);
		border-radius: 6px;
		color: var(--signal-red);
		padding: 0.5rem 0.75rem;
		display: flex;
		gap: 1rem;
		align-items: baseline;
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: thin;
		background:
			repeating-linear-gradient(
				-45deg,
				transparent 0 10px,
				color-mix(in srgb, var(--signal-red) 4%, transparent) 10px 11px
			);
	}
	/* Never shrink below the content, so the stamp scrolls instead of the
	   rows being squeezed; grow to fill when there is room. */
	.body {
		flex: 1;
		min-width: max-content;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.title {
		flex: none;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.12em;
		font-size: 0.95rem;
		white-space: nowrap;
	}
	/* Rows size to their content but never narrower than the visible band, so
	   the divider spans the full width and everything scrolls as one. */
	.body > * {
		width: max-content;
		min-width: 100%;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	li {
		display: flex;
		gap: 0.7rem;
		flex-wrap: nowrap;
		align-items: baseline;
		white-space: nowrap;
	}
	.train {
		font-family: var(--font-display);
		font-size: 1.15rem;
		letter-spacing: 0.04em;
	}
	.when {
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}
	.route {
		font-size: 0.85rem;
	}
	.via-row {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		border-top: 1px dashed color-mix(in srgb, var(--signal-red) 40%, transparent);
		padding-top: 0.35rem;
	}
	.via-label {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.72rem;
		white-space: nowrap;
	}
</style>
