<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { ParsedRecord, ParsedTicket } from '../tickets/types.ts';
	import type { FlexData } from '../tickets/records/uflex.ts';
	import type { FcbTicket } from '../tickets/model.ts';
	import { hexDump } from '../tickets/format.ts';
	import { recordViews, recordLabel } from './records/index.ts';
	import RawView from './records/RawView.svelte';
	import { containerInfo } from './containers.ts';
	import { loadVdvOrgs } from '../tickets/vdv/orgs.ts';
	import { loadIssuerNames, type IssuerTables } from '../tickets/uic/rics.ts';
	import { loadNovaOrgs, type NovaOrgTable } from '../tickets/swisspass/orgs.ts';
	import { loadAirlines, type AirlineTable } from '../tickets/bcbp/codes.ts';
	import { store } from '../state/tickets.svelte.ts';
	import { canRender } from '../input/render.ts';
	import { tabModel } from './tabs.ts';
	import BarcodeView from './BarcodeView.svelte';
	import WalletExport from './WalletExport.svelte';

	let { ticket }: { ticket: ParsedTicket } = $props();

	const container = $derived(ticket.container);
	const records = $derived<ParsedRecord[]>(
		container.kind === 'uic9183' || container.kind === 'dosipas' ? container.envelope.records : []
	);

	// Only fetched for VDV tickets, and only to name the issuer in the header.
	let vdvOrgs = $state<Record<string, string> | null>(null);
	$effect(() => {
		if (container.kind === 'vdv') loadVdvOrgs().then((o) => (vdvOrgs = o));
	});

	const info = $derived(containerInfo(container));

	// The same for the formats that name their issuer by company code: the
	// header shows "RICS 2480" for as long as the tables take to arrive.
	let issuerNames = $state<IssuerTables | null>(null);
	$effect(() => {
		if (info.needsIssuerNames) loadIssuerNames().then((n) => (issuerNames = n));
	});

	// Swiss tickets name their seller by organisation number instead.
	let novaOrgs = $state<NovaOrgTable | null>(null);
	$effect(() => {
		if (info.needsNovaOrgs) loadNovaOrgs().then((o) => (novaOrgs = o));
	});

	// A boarding pass names its issuer by IATA designator.
	let airlines = $state<AirlineTable | null>(null);
	$effect(() => {
		if (info.needsAirlines) loadAirlines().then((a) => (airlines = a));
	});

	const issuer = $derived(
		info.issuer?.(container, {
			vdvOrgs,
			issuerNames,
			novaOrgs,
			airlines,
			passInfo: ticket.source.passInfo
		}) ?? null
	);

	const specimen = $derived.by(() => {
		// ELB says so outright: B.12 reads 1 as a real ticket and 0 as a specimen.
		if (container.kind === 'elb') return container.ticket.specimen;
		// MÁV flags it the same way round, inside the trip block.
		if (container.kind === 'mav') return container.ticket.specimen;
		if (container.kind === 'swisspass') {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (container.ticket.ticketData as any)?.extra?.specimen === true;
		}
		for (const r of records) {
			if (r.kind === 'head') {
				const head = r.data as { flags: { specimen: boolean }; specimenSuspect: boolean };
				if (head.flags.specimen && !head.specimenSuspect) return true;
			}
			if (r.kind === 'flex' && ((r.data as FlexData).ticket as FcbTicket).issuingDetail.specimen)
				return true;
		}
		return false;
	});

	// FCB carries an "activated" flag; only meaningful when a flex record exists.
	const activated = $derived.by(() => {
		for (const r of records) {
			if (r.kind === 'flex') {
				return ((r.data as FlexData).ticket as FcbTicket).issuingDetail.activated === true;
			}
		}
		return null;
	});

	const validUntil = $derived(
		container.kind === 'dosipas' && container.envelope.endOfValidity
			? container.envelope.endOfValidity.slice(0, 16).replace('T', ' ')
			: null
	);

	const envelopeLabel = $derived(info.label(container));

	// The barcode tab needs to know how the payload was encoded, so it is only
	// offered for tickets that came from a symbol this app can also write.
	const showBarcode = $derived(canRender(ticket.symbology));
	const tabs = $derived(
		tabModel({
			kind: container.kind,
			recordKinds: records.map((r) => r.kind),
			hasBarcode: showBarcode
		})
	);
	const { isEnvelope, barcodeIdx, showTabs } = $derived(tabs);

	let openIdx = $state(-1);
	const activeIdx = $derived(openIdx >= 0 ? openIdx : tabs.defaultOpen);
	const active = $derived(isEnvelope ? records[activeIdx] : undefined);
	const ActiveView = $derived(active && !active.error ? recordViews[active.kind] : undefined);
	const barcodeOpen = $derived(showBarcode && activeIdx === barcodeIdx);

	const sourceLabel = $derived(
		{
			image: 'image',
			pdf: 'PDF',
			pkpass: 'Wallet pass',
			camera: 'camera',
			raw: 'file',
			pasted: 'pasted'
		}[ticket.source.kind]
	);
</script>

<article class="ticket" class:specimen>
	<header>
		<div class="issuer-line">
			<span class="issuer">{issuer ?? 'Unrecognized ticket'}</span>
			{#if specimen}<span class="chip specimen-chip">Specimen</span>{/if}
			{#if activated === true}<span class="chip activated">activated</span>
			{:else if activated === false}<span class="chip inactive">not activated</span>{/if}
		</div>
		<div class="meta">
			<span class="chip">{envelopeLabel}</span>
			{#if ticket.symbology}<span class="chip">{ticket.symbology.format}</span>{/if}
			<span class="chip src">{sourceLabel}{ticket.source.fileName ? ` · ${ticket.source.fileName}` : ''}</span>
			{#if validUntil}<span class="chip">barcode valid until {validUntil} UTC</span>{/if}
		</div>
		<button class="remove" onclick={() => store.remove(ticket.id)} aria-label="Remove ticket">✕</button>
	</header>

	{#if ticket.source.passInfo}
		{@const info = ticket.source.passInfo}
		<section class="pass-info">
			{#if info.description}<p class="pass-desc">{info.description}</p>{/if}
			<dl>
				{#each info.fields as f, i (i)}
					{#if f.value !== undefined && f.value !== ''}
						<dt>{f.label ?? f.key}</dt>
						<dd>{f.value}</dd>
					{/if}
				{/each}
			</dl>
		</section>
	{/if}

	{#if showTabs}
		<nav class="tabs" aria-label="Ticket records">
			{#if isEnvelope}
				{#each records as r, i (i)}
					<button
						class="tab"
						class:active={i === activeIdx}
						class:failed={!!r.error}
						onclick={() => (openIdx = i)}
					>
						{recordLabel(r.id, r.kind)}
					</button>
				{/each}
			{:else}
				<!-- The format tab would otherwise be the card header chip a second
				     time; "data" says what it holds, opposite the barcode tab. -->
				<button class="tab" class:active={activeIdx === 0} onclick={() => (openIdx = 0)}>
					{envelopeLabel} data
				</button>
			{/if}
			{#if showBarcode}
				<button class="tab" class:active={barcodeOpen} onclick={() => (openIdx = barcodeIdx)}>
					Barcode
				</button>
			{/if}
		</nav>
	{/if}

	{#if barcodeOpen && ticket.symbology}
		<BarcodeView raw={ticket.raw} symbology={ticket.symbology} />
		<!-- A wallet pass is the same payload in another container, so it
		     belongs with the barcode rather than under the card: both are ways
		     of carrying the symbol away, and neither is a reading of it. -->
		<WalletExport {ticket} />
	{:else if info.view}
		{@const FormatView = info.view}
		<FormatView {...info.props?.(container)} />
	{:else if container.kind === 'text'}
		<pre class="text-payload readout">{container.text}</pre>
		<p class="note">This barcode carries plain text, not any form of supported ticket data.</p>
	{:else if container.kind === 'unknown'}
		<p class="note">Could not recognize this payload. Raw bytes:</p>
		<pre class="text-payload readout">{hexDump(ticket.raw.subarray(0, 512))}</pre>
	{/if}

	{#if active && !barcodeOpen}
		<div class="record-body">
			{#if ActiveView}
				<ActiveView data={active.data} />
			{:else}
				<!-- A record with no view of its own is all readout, so it gets the
				     box the raw record below a decoded one gets. -->
				<div class="readout"><RawView raw={active.raw} error={active.error} /></div>
			{/if}
			{#if ActiveView}
				<details class="rawtoggle readout">
					<summary>Raw record ({active.id.trim()} v{active.version}, {active.raw.length} bytes)</summary>
					<RawView raw={active.raw} />
				</details>
			{/if}
		</div>
	{/if}
</article>

<style>
	.ticket {
		position: relative;
		background:
			radial-gradient(circle at 0 50%, var(--bg) 7px, transparent 7.5px),
			radial-gradient(circle at 100% 50%, var(--bg) 7px, transparent 7.5px),
			repeating-radial-gradient(
				circle at 30% -80%,
				transparent 0 14px,
				var(--guilloche) 14px 15px
			),
			linear-gradient(160deg, var(--paper-hi), var(--paper-lo));
		color: var(--ink);
		border-radius: var(--radius);
		border: 1px solid var(--paper-edge);
		padding: 1rem 1.25rem 1.1rem;
		box-shadow: 0 1px 3px rgba(40, 30, 12, 0.18);
	}
	.ticket.specimen {
		outline: 2px dashed color-mix(in srgb, var(--signal-red) 45%, transparent);
		outline-offset: -6px;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border-bottom: 1px dashed var(--paper-edge);
		padding-bottom: 0.6rem;
		margin-bottom: 0.75rem;
		padding-right: 2rem;
	}
	.issuer-line {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.issuer {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		font-size: 1.05rem;
	}
	.meta {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		color: var(--ink-soft);
	}
	.chip.src {
		border-style: dashed;
		/* long file names must wrap rather than push the page sideways */
		white-space: normal;
		overflow-wrap: anywhere;
		max-width: 100%;
	}
	.specimen-chip {
		color: var(--signal-red);
		font-weight: 600;
	}
	.chip.activated {
		color: var(--valid-green);
	}
	.chip.inactive {
		color: var(--ink-soft);
		border-style: dashed;
	}
	.remove {
		position: absolute;
		top: 0.7rem;
		right: 0.8rem;
		background: none;
		border: none;
		color: var(--ink-soft);
		font-size: 0.9rem;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
	}
	.remove:hover {
		color: var(--signal-red);
	}
	.pass-info {
		margin-bottom: 0.75rem;
	}
	.pass-desc {
		margin: 0 0 0.3rem;
		font-weight: 500;
	}
	.pass-info dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.1rem 1rem;
		margin: 0;
		font-size: 0.85rem;
	}
	.pass-info dt {
		color: var(--ink-soft);
	}
	.pass-info dd {
		margin: 0;
	}
	.text-payload {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin: 0 0 0.4rem;
	}
	.note {
		font-size: 0.82rem;
		color: var(--ink-soft);
		margin: 0;
	}
	.tabs {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.tab {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.78rem;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: transparent;
		color: var(--ink-soft);
	}
	.tab.active {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper-hi);
	}
	.tab.failed {
		border-style: dashed;
		color: var(--signal-red);
	}
	.record-body {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.rawtoggle summary {
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
</style>
