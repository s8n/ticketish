<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { UzDateTime, UzTicket } from '../tickets/uz/uz.ts';
	import { fmtPrice } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: UzTicket } = $props();

	/** Day and month as printed. The record carries no year. */
	const fmtWhen = (t: UzDateTime | null) =>
		t ? `${String(t.day).padStart(2, '0')}.${String(t.month).padStart(2, '0')} ${t.time}` : null;

	const place = $derived(
		[
			ticket.coach ? `coach ${ticket.coach}` : null,
			ticket.coachClass,
			ticket.seat ? `seat ${ticket.seat}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Departs', fmtWhen(ticket.departure)],
		['Arrives', fmtWhen(ticket.arrival)],
		['Place', place],
		['Fare type', ticket.fareType],
		['Passenger', ticket.passenger],
		['Price', ticket.price === null ? null : fmtPrice(ticket.price, 'UAH', 2)],
		['Document', ticket.documentNumber],
		['Station codes', ticket.from && ticket.to ? `${ticket.from.code} → ${ticket.to.code}` : null],
		['Authentication', ticket.authentication],
		['Undecoded', ticket.extra.length ? ticket.extra.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={ticket.train ?? 'Boarding document'}
	from={ticket.from?.name ?? null}
	to={ticket.to?.name ?? null}
	{rows}
	note={'The record carries no year with either time, and no time zone. Dates are shown as the ticket prints them.'}
/>
