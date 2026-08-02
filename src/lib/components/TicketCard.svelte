<script lang="ts">
	import type { ParsedRecord, ParsedTicket } from '../tickets/types.ts';
	import type { FlexData } from '../tickets/records/uflex.ts';
	import type { FcbTicket } from '../tickets/model.ts';
	import { ricsName } from '../tickets/uic/rics.ts';
	import { hexDump } from '../tickets/format.ts';
	import { recordViews, recordLabel } from './records/index.ts';
	import RawView from './records/RawView.svelte';
	import { store } from '../state/tickets.svelte.ts';

	let { ticket }: { ticket: ParsedTicket } = $props();

	const container = $derived(ticket.container);
	const records = $derived<ParsedRecord[]>(
		container.kind === 'uic9183' || container.kind === 'dosipas' ? container.envelope.records : []
	);

	const issuer = $derived.by(() => {
		if (container.kind === 'uic9183') {
			const rics = container.envelope.issuerRics;
			return ricsName(rics) ?? (rics ? `RICS ${rics}` : 'Unknown issuer');
		}
		if (container.kind === 'dosipas') {
			const sp = container.envelope.securityProvider;
			return ricsName(sp) ?? (sp !== null ? `Provider ${sp}` : 'Unknown issuer');
		}
		if (container.kind === 'text' && ticket.source.passInfo?.organizationName) {
			return ticket.source.passInfo.organizationName;
		}
		return null;
	});

	const specimen = $derived.by(() => {
		for (const r of records) {
			if (r.kind === 'head' && (r.data as { flags: { specimen: boolean } }).flags.specimen)
				return true;
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

	const envelopeLabel = $derived(
		container.kind === 'uic9183'
			? `UIC 918.3 v${container.envelope.envelopeVersion}`
			: container.kind === 'dosipas'
				? `DOSIPAS U${container.envelope.headerVersion}`
				: container.kind === 'text'
					? 'Plain text'
					: 'Unknown format'
	);

	// Prefer the richest record as the initially open tab.
	const defaultOpen = $derived.by(() => {
		const order = ['flex', 'db-bl', 'layout', 'db-vu', 'head'];
		for (const kind of order) {
			const i = records.findIndex((r) => r.kind === kind);
			if (i >= 0) return i;
		}
		return records.length ? 0 : -1;
	});
	let openIdx = $state(-1);
	const activeIdx = $derived(openIdx >= 0 ? openIdx : defaultOpen);
	const active = $derived(records[activeIdx]);
	const ActiveView = $derived(active && !active.error ? recordViews[active.kind] : undefined);

	const sourceLabel = $derived(
		{
			image: 'image',
			pdf: 'PDF',
			pkpass: 'Wallet pass',
			camera: 'camera',
			raw: 'file'
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
			{#if ticket.barcodeFormat}<span class="chip">{ticket.barcodeFormat}</span>{/if}
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

	{#if container.kind === 'text'}
		<pre class="text-payload">{container.text}</pre>
		<p class="note">This barcode carries plain text, not UIC ticket data.</p>
	{:else if container.kind === 'unknown'}
		<p class="note">Could not recognize this payload. Raw bytes:</p>
		<pre class="text-payload">{hexDump(ticket.raw.subarray(0, 512))}</pre>
	{/if}

	{#if records.length}
		<nav class="tabs" aria-label="Ticket records">
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
		</nav>
		{#if active}
			<div class="record-body">
				{#if ActiveView}
					<ActiveView data={active.data} />
				{:else}
					<RawView raw={active.raw} error={active.error} />
				{/if}
				{#if ActiveView}
					<details class="rawtoggle">
						<summary>Raw record ({active.id.trim()} v{active.version}, {active.raw.length} bytes)</summary>
						<RawView raw={active.raw} />
					</details>
				{/if}
			</div>
		{/if}
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
		background: color-mix(in srgb, var(--paper-hi) 55%, white 45%);
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		padding: 0.6rem;
		overflow-x: auto;
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
	.rawtoggle[open] {
		background: color-mix(in srgb, var(--paper-hi) 55%, white 45%);
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		padding: 0.5rem;
	}
</style>
