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
	 * The rail is two halves rather than one piece, because on a narrow card it
	 * has to break across two rows: the first half leaves the origin and runs
	 * to the edge, the second comes back in and arrows into the destination.
	 * Side by side with nothing between them they read as one line, which is
	 * what they are on a wide card.
	 */
	let {
		from = null,
		to = null,
		size = 'lg'
	}: {
		from?: string | null;
		to?: string | null;
		/** The smaller national formats set their route a shade smaller. */
		size?: 'lg' | 'sm';
	} = $props();
</script>

<div class="route-box">
	<div class="route" class:sm={size === 'sm'}>
		<span class="station from">{from ?? '–'}</span>
		<span class="half out" aria-hidden="true">
			<span class="dot"></span><span class="rail"></span>
		</span>
		<!-- Reads as "X to Y" rather than two names run together. -->
		<span class="sr-only">to</span>
		<span class="brk" aria-hidden="true"></span>
		<span class="half in" aria-hidden="true">
			<span class="rail"></span><span class="head"></span>
		</span>
		<span class="station to">{to ?? '–'}</span>
	</div>
</div>

<style>
	.route-box {
		container-type: inline-size;
	}
	.route {
		display: flex;
		align-items: center;
		/* Wide enough for one row, so a long name wraps inside its own half of
		   the line rather than pushing the row into a second one. */
		flex-wrap: nowrap;
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
		margin-right: 0.7rem;
	}
	.to {
		margin-left: 0.7rem;
	}
	.half {
		display: flex;
		align-items: center;
	}
	/* The half that leaves the origin takes whatever width is going, but never
	   shrinks past a stub: a lone dot beside a name that has wrapped to fill
	   the row does not read as a line at all. */
	.out {
		flex: 1 1 3.5rem;
		min-width: 2.5rem;
	}
	.out .rail {
		flex: 1;
	}
	/* The half that arrives is just the arrowhead until the line breaks. */
	.in {
		flex: none;
	}
	.in .rail {
		width: 0;
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
	.brk {
		display: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* Two station names either side of a rail stop fitting long before a phone
	   runs out of width, and a route that has to be swiped sideways is a route
	   nobody reads. Break the line instead, so it leaves the origin at the end
	   of one row and arrives at the destination on the next.

	   The threshold is generous on purpose. Well above the point where a name
	   actually overflows there is a band where it technically fits but the
	   rail is squeezed to a stub and a name like "London St Pancras
	   International" wraps to three lines. Breaking beats that, so the switch
	   happens before it. */
	@container (max-width: 34rem) {
		.route {
			flex-wrap: wrap;
			row-gap: 0.3rem;
		}
		/* A zero height item on a full row, which is what forces the break to
		   fall between the two halves instead of wherever the names run out. */
		.brk {
			display: block;
			flex-basis: 100%;
			height: 0;
		}
		/* Zero basis on both, so neither can be wide enough to want a row of its
		   own: wrapping beats shrinking in flex layout, and the break belongs
		   where .brk puts it rather than wherever a long name runs out. */
		.out {
			flex: 1 1 0;
		}
		.to {
			flex: 1 1 0;
			min-width: 0;
			margin-left: 0.5rem;
		}
		/* Now a visible run-in, so the second row starts as a line rather than
		   as an arrowhead sitting on its own. */
		.in .rail {
			width: 2.5rem;
		}
	}
</style>
