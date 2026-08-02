<script lang="ts">
	import type { VdvBarcode } from '../tickets/vdv/vdv.ts';
	import { fmtDate } from '../tickets/format.ts';

	let { barcode }: { barcode: VdvBarcode } = $props();
</script>

<div class="vdv">
	{#if barcode.error}
		<p class="error">{barcode.error}</p>
	{/if}

	{#each barcode.tickets as t, i (i)}
		<section class="ticket-data">
			<header>
				<span class="product">Product {t.productNumber}</span>
				<span class="soft">org {t.productOrgId}</span>
			</header>
			<dl>
				<dt>Valid from</dt>
				<dd>{fmtDate(t.validityStart)}</dd>
				<dt>Valid until</dt>
				<dd>{fmtDate(t.validityEnd)}</dd>
				<dt>Ticket ID</dt>
				<dd><code>{t.ticketId}</code> <span class="soft">org {t.ticketOrgId}</span></dd>
				{#if t.transactionTime}
					<dt>Sold</dt>
					<dd>{fmtDate(t.transactionTime)} <span class="soft">KVP org {t.kvpOrgId}</span></dd>
				{/if}
				{#if t.locationNumber}
					<dt>Sale location</dt>
					<dd>{t.locationNumber} <span class="soft">org {t.locationOrgId}</span></dd>
				{/if}
				<dt>SAM</dt>
				<dd><code>{t.samId}</code> <span class="soft">v{t.samVersion}</span></dd>
				<dt>Spec version</dt>
				<dd>{t.version}</dd>
			</dl>

			{#each t.productData as el, ei (ei)}
				{#if el.data}
					<div class="element">
						<span class="element-name">{el.name}</span>
						<dl>
							{#each Object.entries(el.data) as [k, v] (k)}
								{#if v !== null && v !== undefined && v !== 0}
									<dt>{k}</dt>
									<dd>{v}</dd>
								{/if}
							{/each}
						</dl>
					</div>
				{:else}
					<details class="element">
						<summary>{el.name} <span class="soft">({el.hex.length / 2} bytes)</span></summary>
						<code class="hex">{el.hex}</code>
					</details>
				{/if}
			{/each}
		</section>
	{/each}

	<dl class="envelope-info">
		{#if barcode.certificateHolder}
			<dt>Signed by</dt>
			<dd>{barcode.certificateHolder}</dd>
		{/if}
		{#if barcode.caReference}
			<dt>CA</dt>
			<dd><code>{barcode.caReference}</code></dd>
		{/if}
		{#if barcode.container === 'motics'}
			<dt>Container</dt>
			<dd>MOTICS copy protection{barcode.containerIdentifier ? ` (${barcode.containerIdentifier})` : ''}</dd>
		{/if}
	</dl>
	<p class="note">
		VDV organisation and product names are not bundled; numeric IDs are shown as-is.
	</p>
</div>

<style>
	.vdv {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--signal-red);
	}
	.ticket-data {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	header {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.product {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.2rem;
		text-transform: uppercase;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.15rem 1rem;
		margin: 0;
		font-size: 0.88rem;
	}
	dt {
		color: var(--ink-soft);
	}
	dd {
		margin: 0;
	}
	.soft {
		color: var(--ink-soft);
		font-size: 0.82rem;
	}
	.element {
		border-top: 1px dotted var(--paper-edge);
		padding-top: 0.4rem;
	}
	.element-name,
	summary {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.74rem;
		color: var(--ink-soft);
		cursor: default;
	}
	summary {
		cursor: pointer;
	}
	.hex {
		font-size: 0.72rem;
		word-break: break-all;
		display: block;
		margin-top: 0.3rem;
	}
	.envelope-info {
		border-top: 1px dashed var(--paper-edge);
		padding-top: 0.6rem;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
</style>
