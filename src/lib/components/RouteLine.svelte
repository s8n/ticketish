<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * The origin and destination of a journey, joined by a rail.
	 *
	 * Every format's view draws this the same way, so it lives here rather than
	 * being copied into each of them.
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
		<span class="station">{from ?? '–'}</span>
		<span class="line" aria-hidden="true">
			<span class="dot"></span><span class="rail"></span><span class="dot"></span>
		</span>
		<span class="station">{to ?? '–'}</span>
	</div>
</div>

<style>
	.route-box {
		container-type: inline-size;
	}
	.route {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.7rem;
	}
	.station {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.45rem;
		line-height: 1.1;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		/* Long names wrap inside their own column rather than widening the row.
		   break-word rather than anywhere: a station name should give way at a
		   space, and only split a word that would not fit on a line by itself. */
		min-width: 0;
		overflow-wrap: break-word;
	}
	.route.sm .station {
		font-size: 1.3rem;
		letter-spacing: normal;
	}
	.line {
		display: flex;
		align-items: center;
		min-width: 3.5rem;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ink);
		flex: none;
	}
	.rail {
		flex: 1;
		height: 0;
		border-top: 2px solid var(--ink);
	}

	/* Two station names either side of a rail stop fitting long before a phone
	   runs out of width, and a route that has to be swiped sideways is a route
	   nobody reads. Stack it instead: name, rail, name, which is how the
	   stations sit on a printed ticket anyway.

	   The threshold is generous on purpose. Well above the point where a name
	   actually overflows there is a band where it technically fits but the
	   rail is squeezed to a stub and a name like "London St Pancras
	   International" wraps to three lines. Stacked looks better than that, so
	   the switch happens before it. */
	@container (max-width: 34rem) {
		.route {
			grid-template-columns: 1fr;
			gap: 0.3rem;
		}
		.line {
			min-width: 0;
		}
	}
</style>
