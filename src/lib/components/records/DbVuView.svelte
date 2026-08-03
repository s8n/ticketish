<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { DbVuData } from '../../tickets/records/dbvu.ts';
	import { fmtDate, fmtPrice } from '../../tickets/format.ts';

	let { data }: { data: DbVuData } = $props();
</script>

<div class="vu">
	<p class="head">
		Verbund products (VDV-KA) · {data.travellerCount} traveler{data.travellerCount === 1 ? '' : 's'}
	</p>
	{#each data.products as p, i (i)}
		<dl class="fields">
			<dt>Product</dt>
			<dd>#{p.productNumber} (PV org {p.pvOrgId}, KVP org {p.kvpOrgId})</dd>
			<dt>Valid</dt>
			<dd>{fmtDate(p.validFrom)} – {fmtDate(p.validTo)}</dd>
			{#if p.price !== null}<dt>Price</dt>
				<dd>{fmtPrice(p.price)}</dd>{/if}
			<dt>Authorization</dt>
			<dd><code>{p.authorizationNumber}</code></dd>
		</dl>
	{/each}
</div>

<style>
	.vu {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.head {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
</style>
