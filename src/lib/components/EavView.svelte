<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { EavTicket } from '../tickets/eav/eav.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: EavTicket } = $props();

	const rows = $derived<[string, string | null | undefined][]>([
		['Valid from', ticket.validFrom ? fmtDate(ticket.validFrom) : null],
		['Valid until', ticket.validUntil ? fmtDate(ticket.validUntil) : null],
		['PNR', ticket.pnr],
		['Sold', ticket.soldAt ? fmtDate(ticket.soldAt.slice(0, 16)) : null],
		['Codes', ticket.codes.length ? ticket.codes.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={ticket.ticketType.replace(/_/g, ' ')}
	{rows}
	note="Data may be incomplete, specification unavailable."
/>
