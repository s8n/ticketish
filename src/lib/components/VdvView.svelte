<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import { onMount } from 'svelte';
	import type { VdvBarcode } from '../tickets/vdv/vdv.ts';
	import { fmtDate } from '../tickets/format.ts';
	import { loadVdvProducts, vdvProductName } from '../tickets/vdv/products.ts';
	import { loadVdvOrgs, vdvOrgLabel, vdvOrgName } from '../tickets/vdv/orgs.ts';

	let { barcode }: { barcode: VdvBarcode } = $props();

	// Both tables are a few dozen KiB, so they load only for VDV tickets.
	let products = $state<Record<string, string> | null>(null);
	let orgs = $state<Record<string, string> | null>(null);
	onMount(async () => {
		[products, orgs] = await Promise.all([loadVdvProducts(), loadVdvOrgs()]);
	});

	const productName = (orgId: number, number: number) =>
		vdvProductName(products, orgId, number);
	const orgLabel = (code: number | undefined | null) => vdvOrgLabel(orgs, code);
</script>

<div class="vdv">
	{#if barcode.error}
		<p class="error">{barcode.error}</p>
	{/if}

	{#each barcode.tickets as t, i (i)}
		<section class="ticket-data">
			<header>
				<span class="product">
					{productName(t.productOrgId, t.productNumber) ?? `Product ${t.productNumber}`}
				</span>
				<span class="soft">
					{orgLabel(t.productOrgId)}{#if productName(t.productOrgId, t.productNumber)} · product {t.productNumber}{/if}
				</span>
			</header>
			<dl class="fields">
				<dt>Valid from</dt>
				<dd>{fmtDate(t.validityStart)}</dd>
				<dt>Valid until</dt>
				<dd>{fmtDate(t.validityEnd)}</dd>
				<dt>Ticket ID</dt>
				<dd><code>{t.ticketId}</code> <span class="soft">{orgLabel(t.ticketOrgId)}</span></dd>
				{#if t.transactionTime}
					<dt>Sold</dt>
					<dd>{fmtDate(t.transactionTime)} <span class="soft">via {orgLabel(t.kvpOrgId)}</span></dd>
				{/if}
				{#if t.locationNumber}
					<dt>Sale location</dt>
					<dd>{t.locationNumber} <span class="soft">{orgLabel(t.locationOrgId)}</span></dd>
				{/if}
				<dt>SAM</dt>
				<dd><code>{t.samId}</code> <span class="soft">v{t.samVersion}</span></dd>
				<dt>Spec version</dt>
				<dd>{t.version}</dd>
			</dl>

			{#each t.productData as el, ei (ei)}
				{#if el.passenger}
					{@const p = el.passenger}
					<div class="element">
						<span class="element-name">Passenger</span>
						<dl class="fields">
							{#if p.forename || p.surname}
								<dt>Name</dt>
								<dd>
									{[p.forename, p.surname].filter(Boolean).join(' ')}
									{#if p.abbreviated}<span class="soft">abbreviated on the ticket</span>{/if}
								</dd>
							{/if}
							{#if p.dateOfBirth}
								<dt>Born</dt>
								<dd>{fmtDate(p.dateOfBirth)}</dd>
							{/if}
							{#if p.gender}
								<dt>Gender</dt>
								<dd>{p.gender}</dd>
							{/if}
						</dl>
					</div>
				{:else if el.data}
					<div class="element">
						<span class="element-name">{el.name}</span>
						<dl class="fields">
							{#each Object.entries(el.data) as [k, v] (k)}
								{#if v !== null && v !== undefined && v !== 0}
									<dt>{k}</dt>
									<dd>{v}</dd>
								{/if}
							{/each}
						</dl>
					</div>
				{:else if el.text}
					<div class="element">
						<span class="element-name">{el.name}</span>
						<code class="text">{el.text}</code>
					</div>
				{:else}
					<details class="element">
						<summary>{el.name} <span class="soft">({el.hex.length / 2} bytes)</span></summary>
						<code class="hex readout">{el.hex}</code>
					</details>
				{/if}
			{/each}
		</section>
	{/each}

	<dl class="fields divider">
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
	{#if orgs && !vdvOrgName(orgs, barcode.tickets[0]?.productOrgId)}
		<p class="note">This organisation is not in our list; numeric IDs are shown as-is.</p>
	{/if}
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
	.text {
		font-size: 0.78rem;
		word-break: break-all;
		display: block;
		margin-top: 0.2rem;
	}
	.hex {
		font-size: 0.72rem;
		word-break: break-all;
		display: block;
		margin-top: 0.3rem;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
</style>
