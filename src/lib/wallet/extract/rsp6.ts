// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for UK RSP6 tickets. */
import type { Rsp6Ticket, Rsp6TicketData } from '../../tickets/rsp/rsp6.ts';
import { nlcEntry } from '../../tickets/rsp/nlc.ts';
import type { TripField, TripSummary, Tables } from '../summary.ts';

const COUPONS: Record<Rsp6TicketData['couponType'], string> = {
	single: 'Single',
	season: 'Season',
	outbound: 'Return, outbound',
	inbound: 'Return, inbound'
};

/**
 * An RSP6 travel ticket as a pass.
 *
 * Only tickets are mapped. A railcard barcode follows a separate standard
 * that is not fully decoded here, and a pass is read by an inspector, so it
 * gets none rather than one that may say the wrong thing. A ticket whose
 * payload could not be recovered has nothing to put on a pass either.
 *
 * The start is a date and a time, and the flag beside it says what the time
 * means: a specific train is a departure, "valid after" is the start of the
 * validity, and otherwise the time is not a time the ticket binds anyone to,
 * so only the date is kept. A suggested departure goes on the back as what
 * it is. Times are UK local and the barcode says nothing of a zone, so none
 * goes on the pass.
 */
export function rsp6Trip(ticket: Rsp6Ticket, tables: Tables): TripSummary | null {
	if (!ticket.keyRecovered || ticket.data?.kind !== 'ticket') return null;
	const t = ticket.data;

	// a code the table does not know is shown as the code, the way the view
	// shows it: a pass an inspector reads should not guess at a station
	const station = (code: string) =>
		code ? (nlcEntry(tables.nlcNames, code)?.n ?? `NLC ${code}`) : undefined;

	const date = t.startDate.slice(0, 10);
	const details: TripField[] = [];
	let departure: string | undefined;
	let validFrom: string | undefined;
	if (t.departTimeFlag === 'specificDeparture') departure = t.startDate;
	else if (t.departTimeFlag === 'validAfter') validFrom = t.startDate;
	else validFrom = date;
	if (t.departTimeFlag === 'suggestedDeparture') {
		details.push({ label: 'Suggested departure', value: t.startDate.slice(11, 16) });
	}

	const [first, ...further] = t.reservations;
	for (const r of further) {
		details.push({
			label: 'Reservation',
			value: [r.serviceId, r.coach && `coach ${r.coach}`, r.seat && `seat ${r.seat}`]
				.filter(Boolean)
				.join(', ')
		});
	}

	details.push({ label: 'Fare', value: `${t.fareLabel} (Lennon ${t.lennonTicketType})` });
	if (t.childTicket) details.push({ label: 'Passenger', value: 'child' });
	if (t.purchase?.daysOfValidity) {
		const days = t.purchase.daysOfValidity;
		details.push({ label: 'Validity', value: `${days} day${days > 1 ? 's' : ''}` });
	}
	if (t.routeCode) details.push({ label: 'Route code', value: String(t.routeCode) });
	if (t.restrictionCode) details.push({ label: 'Restriction', value: t.restrictionCode });

	return {
		shape: 'journey',
		issuer: 'National Rail',
		product: COUPONS[t.couponType],
		travelClass: t.standardClass ? 'Standard' : 'First',
		from: station(t.originNlc),
		to: station(t.destinationNlc),
		departure,
		validFrom,
		train: first?.serviceId || undefined,
		coach: first?.coach || undefined,
		seat: first?.seat || undefined,
		ticketId: ticket.ticketRef,
		reference: t.purchase?.purchaseReference || undefined,
		price: t.purchase ? `${(t.purchase.pricePence / 100).toFixed(2)} GBP` : undefined,
		details
	};
}
