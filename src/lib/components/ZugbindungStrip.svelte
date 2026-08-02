<script lang="ts">
	import type { TrainBinding } from '../tickets/model.ts';
	import { fmtDate } from '../tickets/format.ts';

	let { bindings }: { bindings: TrainBinding[] } = $props();
</script>

<!-- The red overprint stamp: the deciphered Zugbindung. -->
<div class="stamp" role="note" aria-label="Zugbindung - ticket bound to specific trains">
	<span class="title">Zugbindung</span>
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
</div>

<style>
	/* Single band per binding; swipes sideways on narrow screens instead of
	   wrapping into lines. */
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
	.title {
		font-family: var(--font-display);
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.12em;
		font-size: 0.95rem;
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
</style>
