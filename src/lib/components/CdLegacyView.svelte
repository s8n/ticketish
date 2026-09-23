<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { CdLegacyTicket } from '../tickets/cd/legacy.ts';
	import { fmtDateTimeOrNull } from '../tickets/format.ts';
	import SimpleTicketView, { type Row } from './SimpleTicketView.svelte';

	let { ticket }: { ticket: CdLegacyTicket } = $props();

	const rows = $derived<Row[]>([
		['Valid from', fmtDateTimeOrNull(ticket.validFrom)],
		['Valid until', fmtDateTimeOrNull(ticket.validUntil)],
		['Issued', fmtDateTimeOrNull(ticket.issued)]
	]);
</script>

<SimpleTicketView
	title="ČD ticket"
	{rows}
	note={'The older ČD layout, for which no specification is published. Only the three timestamps are placed; the route, distance and fare are printed on the ticket but have not been found in the barcode.'}
	undecoded={{ label: 'Undecoded body', hex: ticket.bodyHex }}
/>
