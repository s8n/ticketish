<script lang="ts">
	import type { SncfETicket } from '../tickets/sncf/eticket.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { ticket }: { ticket: SncfETicket } = $props();

	const classLabel = $derived(
		{ '1': '1st class', '2': '2nd class' }[ticket.travelClass] ?? ticket.travelClass
	);

	const pad = (n: number) => String(n).padStart(2, '0');
	// no year in the record, so a day.month. stub is all that can be shown
	const travelDate = $derived(
		ticket.travelDate ? `${pad(ticket.travelDate.day)}.${pad(ticket.travelDate.month)}.` : null
	);

	const passenger = $derived([ticket.forename, ticket.surname].filter(Boolean).join(' '));

	const returnLeg = $derived(
		ticket.returnLeg
			? [
					`${ticket.returnLeg.originCode} - ${ticket.returnLeg.destinationCode}`,
					ticket.returnLeg.trainNumber ? `train ${ticket.returnLeg.trainNumber}` : null
				]
					.filter(Boolean)
					.join(' · ')
			: null
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Travel date', travelDate],
		['Class', classLabel],
		['Passenger', passenger],
		['Date of birth', ticket.dateOfBirth ? fmtDate(ticket.dateOfBirth) : null],
		['PNR', ticket.pnr],
		['Ticket number', ticket.ticketNumber],
		['Customer reference', ticket.customerReference],
		['Tariff', ticket.tariffCode],
		['Return', returnLeg],
		['Undecoded', ticket.extraFields.length ? ticket.extraFields.join(' · ') : null]
	]);
</script>

<SimpleTicketView
	title={`Train ${ticket.trainNumber}`}
	from={ticket.originCode}
	to={ticket.destinationCode}
	{rows}
	note={'Reverse engineered, no specification available. The record carries no year with the travel date and no coach or seat, even when the ticket prints them. Stations are SNCF mnemonics rather than UIC codes.'}
/>
