<script lang="ts">
	import type { SsbEnvelope } from '../tickets/ssb/ssb.ts';
	import { fmtDate } from '../tickets/format.ts';

	let { envelope }: { envelope: SsbEnvelope } = $props();

	const k = $derived(envelope.data);
	const travelClass = $derived(
		k?.travelClass === 1 ? '1st class' : k?.travelClass === 2 ? '2nd class' : null
	);
</script>

<div class="ssb">
	{#if k}
		<header>
			<span class="product">{k.productName}</span>
			{#if travelClass}<span class="chip">{travelClass}</span>{/if}
		</header>
		<dl>
			<dt>Card number</dt>
			<dd><code>{k.cardId}</code></dd>
			<dt>Valid</dt>
			<dd>{fmtDate(k.validityStart)} – {fmtDate(k.validityEnd)}</dd>
			<dt>Issued</dt>
			<dd>{fmtDate(k.issuingDate)}</dd>
			<dt>Travelers</dt>
			<dd>
				{k.numAdults} adult{k.numAdults === 1 ? '' : 's'}{k.numChildren
					? `, ${k.numChildren} child${k.numChildren === 1 ? '' : 'ren'}`
					: ''}
			</dd>
			{#if k.numTravelDays}<dt>Travel days</dt>
				<dd>{k.numTravelDays}</dd>{/if}
			{#if k.stationUic}<dt>Station</dt>
				<dd>UIC {k.stationUic}</dd>{/if}
			{#if k.extraText}<dt>Notes</dt>
				<dd class="small">{k.extraText}</dd>{/if}
		</dl>
	{:else}
		<p class="note">{envelope.unsupported ?? 'This SSB ticket type is not decoded yet.'}</p>
		<details>
			<summary>Raw body ({envelope.bodyHex.length / 2} bytes)</summary>
			<code class="hex">{envelope.bodyHex}</code>
		</details>
	{/if}

	<dl class="envelope-info">
		<dt>Ticket type</dt>
		<dd>{envelope.ticketTypeName} <span class="soft">({envelope.ticketType})</span></dd>
		<dt>Issuer</dt>
		<dd>RICS {envelope.issuerRics}</dd>
	</dl>
</div>

<style>
	.ssb {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
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
		font-size: 1.25rem;
		text-transform: uppercase;
	}
	.chip {
		color: var(--rail-blue);
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
	dd.small {
		font-size: 0.8rem;
	}
	.soft {
		color: var(--ink-soft);
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	summary {
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--ink-soft);
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
</style>
