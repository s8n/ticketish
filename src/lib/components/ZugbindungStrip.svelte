<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

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
     belongs with the trains it binds, so the via map sits inside.

     A fieldset for the one thing only a fieldset does: a legend interrupts the
     border it sits on, natively, with no patch of background pretending to. So
     the label costs no width at all, which on a phone is the width the route
     was short of. The role is still note, since this groups no form controls
     and the element is here for how it draws. -->
<fieldset class="stamp" role="note" aria-label="Zugbindung - ticket bound to specific trains">
	<legend class="title">Zugbindung</legend>
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
</fieldset>

<style>
	.stamp {
		border: 2px solid var(--signal-red);
		border-radius: 6px;
		color: var(--signal-red);
		/* a fieldset carries margins and a min-inline-size of min-content, and
		   that last one would stop the card ever being narrower than the route */
		margin: 0;
		min-inline-size: 0;
		padding: 0.3rem 0.75rem 0.5rem;
		background:
			repeating-linear-gradient(
				-45deg,
				transparent 0 10px,
				color-mix(in srgb, var(--signal-red) 4%, transparent) 10px 11px
			);
	}
	/* The rows scroll rather than the whole stamp, now that the label is on the
	   border and not beside them: swiping the route leaves the label where it
	   is, the way a stamp on paper stays where it was pressed. */
	.body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.title {
		margin-inline-start: 0.25rem;
		/* the gap the border is cut for: wide enough that the rule stops clear
		   of the letters */
		padding-inline: 0.4rem;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.12em;
		font-size: 0.8rem;
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
