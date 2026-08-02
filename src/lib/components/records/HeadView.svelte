<script lang="ts">
	import type { HeadData } from '../../tickets/records/uhead.ts';
	import { ricsName } from '../../tickets/uic/rics.ts';
	import { fmtDate } from '../../tickets/format.ts';

	let { data }: { data: HeadData } = $props();
</script>

<dl>
	<dt>Ticket ID</dt>
	<dd><code>{data.ticketId}</code></dd>
	<dt>Distributor</dt>
	<dd>{ricsName(data.distributingRics) ?? `RICS ${data.distributingRics}`}</dd>
	<dt>Issued</dt>
	<dd>{fmtDate(data.issuedAt)}</dd>
	<dt>Language</dt>
	<dd>{data.language}{data.secondLanguage ? ` / ${data.secondLanguage}` : ''}</dd>
	{#if data.flags.internationalTicket}<dt>Scope</dt>
		<dd>International</dd>{/if}
	{#if data.flags.specimen && data.specimenSuspect}
		<dt>Note</dt>
		<dd>
			Specimen flag is set, but this issuer is known to misuse the flags field on genuine
			tickets - likely not a specimen.
		</dd>
	{:else if data.flags.specimen}<dt>Note</dt>
		<dd>Specimen ticket</dd>{/if}
</dl>

<style>
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
</style>
