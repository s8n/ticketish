<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * A BoB ticket, one block per claim set plus the two signature layers.
	 *
	 * The rotating device signature gets its own line rather than being folded
	 * in with the issuer's. It is the field that explains why a saved copy of
	 * one of these stops working, so it is worth showing rather than hiding as
	 * a detail of the envelope.
	 */
	import type { BobTicket } from '../tickets/bob/bob.ts';
	import { fmtDate } from '../tickets/format.ts';

	let { ticket }: { ticket: BobTicket } = $props();

	const passengerText = (p: { category: string | null; count: string | null }) =>
		[p.count, p.category].filter(Boolean).join(' × ') || null;
</script>

<div class="bob">
	{#each ticket.claims as claim, i (i)}
		<section class="claim">
			<header>
				<span class="product">Ticket</span>
				{#if claim.ticketId}<span class="tid">{claim.ticketId}</span>{/if}
			</header>

			<dl class="fields">
				{#if claim.condition?.validFrom || claim.condition?.validUntil}
					<dt>Valid</dt>
					<dd>{fmtDate(claim.condition.validFrom)} – {fmtDate(claim.condition.validUntil)}</dd>
				{/if}
				{#each claim.passengers as p, j (j)}
					{@const text = passengerText(p)}
					{#if text}
						<dt>Travellers</dt>
						<dd>{text}</dd>
					{/if}
				{/each}
				{#if claim.condition?.names.length}
					<dt>Conditions</dt>
					<dd>{claim.condition.names.join(', ')}</dd>
				{/if}
				<dt>Issued by</dt>
				<dd>Participant {claim.participantId}</dd>
			</dl>

			{#if claim.condition}
				<p class="tc">
					<span class="tc-label">Travel condition</span>
					<code>{claim.condition.raw}</code>
				</p>
			{/if}
		</section>
	{/each}

	<dl class="fields sig">
		<dt>Issuer signature</dt>
		<dd>
			{ticket.issuer.algorithm ?? '–'}, expires {fmtDate(ticket.issuer.expires)}
		</dd>
		<dt>Device signature</dt>
		<dd>
			{ticket.device.algorithm ?? '–'}, stamped {fmtDate(ticket.device.signedAt)}
		</dd>
	</dl>

	<p class="note">
		The device signature is re-made every few seconds and an inspector's reader checks how
		recent it is, so this barcode stops validating shortly after it was captured even though
		the ticket inside it runs to its own end date. Neither signature is verified here: the
		keys are in Samtrafiken's participant registry, which is not public.
	</p>
</div>

<style>
	.bob {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.claim {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	header {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.product {
		font-weight: 600;
	}
	.tid {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
	.tc {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.tc-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-soft);
	}
	.tc code {
		font-size: 0.75rem;
		word-break: break-all;
		color: var(--ink-soft);
	}
	.sig {
		border-top: 1px dotted var(--paper-edge);
		padding-top: 0.7rem;
	}
	.note {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--ink-soft);
	}
</style>
