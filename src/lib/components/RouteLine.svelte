<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * The origin and destination of a journey, joined by a rail that arrows
	 * into the destination.
	 *
	 * Every format's view draws this the same way, so it lives here rather than
	 * being copied into each of them.
	 *
	 * It breaks across two rows when the names do not fit beside each other,
	 * leaving the origin at the end of one row and arriving at the destination
	 * on the next. The rail is in two halves for that reason, one grouped with
	 * each station: side by side with nothing between them they read as the one
	 * line they are, and when the second group wraps the line carries on where
	 * it left off.
	 *
	 * Nothing here measures the card. Grouping each half of the rail with its
	 * own station is what makes ordinary flex wrapping break in the right
	 * place, so the decision is made on whether the content actually fits
	 * rather than on a width someone guessed at. A short route stays on one
	 * line on a phone, which a container query could not manage: the card is
	 * narrower than any sensible threshold whatever the names are.
	 */
	import type { Snippet } from 'svelte';

	let {
		from = null,
		to = null,
		size = 'lg',
		fromTitle = null,
		toTitle = null,
		fromBadge,
		toBadge
	}: {
		from?: string | null;
		to?: string | null;
		/** The smaller national formats set their route a shade smaller. */
		size?: 'lg' | 'sm';
		/**
		 * Hover text for a station, where the view has the code a name was
		 * resolved from and wants to keep it within reach.
		 */
		fromTitle?: string | null;
		toTitle?: string | null;
		/**
		 * Rendered inside the station, after its name. For the views that hang
		 * something off it, such as RSP6's CRS letters. Styled by the caller,
		 * which is where the markup is written.
		 */
		fromBadge?: Snippet;
		toBadge?: Snippet;
	} = $props();
</script>

<div class="route" class:sm={size === 'sm'}>
	<span class="leg depart">
		<span class="station from" title={fromTitle ?? undefined}
			>{from ?? '–'}{#if fromBadge}{@render fromBadge()}{/if}</span
		>
		<span class="half out" aria-hidden="true">
			<span class="dot"></span><span class="rail"></span>
		</span>
	</span>
	<!-- Reads as "X to Y" rather than two names run together. -->
	<span class="sr-only">to</span>
	<span class="leg arrive">
		<span class="half in" aria-hidden="true">
			<span class="rail"></span><span class="head"></span>
		</span>
		<span class="station to" title={toTitle ?? undefined}
			>{to ?? '–'}{#if toBadge}{@render toBadge()}{/if}</span
		>
	</span>
</div>

<style>
	.route {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		/* No column gap: the two halves of the rail have to meet when they sit
		   on the same row, or the line reads as two. */
		column-gap: 0;
		row-gap: 0.3rem;
	}
	.leg {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	/* The leaving half takes whatever slack is going, so the rail fills the
	   row it is on. The arriving half stays at its content width, which is
	   what lets it wrap as one piece instead of stranding the arrowhead. */
	.depart {
		flex: 1 1 auto;
	}
	.arrive {
		flex: 0 1 auto;
	}
	.station {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.45rem;
		line-height: 1.1;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		/* break-word rather than anywhere: a station name should give way at a
		   space, and only split a word that would not fit on a line by itself. */
		min-width: 0;
		overflow-wrap: break-word;
	}
	.route.sm .station {
		font-size: 1.3rem;
		letter-spacing: normal;
	}
	.from {
		margin-right: 0.5rem;
	}
	.to {
		margin-left: 0.5rem;
	}
	.half {
		display: flex;
		align-items: center;
	}
	/* Never shrinks past a stub: a lone dot beside a name that has wrapped to
	   fill the row does not read as a line at all. */
	.out {
		flex: 1 1 2rem;
		min-width: 1.75rem;
	}
	.out .rail {
		flex: 1;
	}
	/* A fixed run-in, so a broken line starts the second row as a line rather
	   than as an arrowhead on its own. On one row it simply makes the rail a
	   little longer, since the two halves meet. */
	.in {
		flex: none;
	}
	.in .rail {
		width: 1.75rem;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ink);
		flex: none;
	}
	.rail {
		height: 0;
		border-top: 2px solid var(--ink);
	}
	.head {
		flex: none;
		width: 0;
		height: 0;
		border-left: 8px solid var(--ink);
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
