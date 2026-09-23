// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for SSB1 tickets, as VR issues them. */
import type { Ssb1Ticket } from '../../tickets/ssb/ssb1.ts';
import { uicStationName } from '../../tickets/stations.ts';
import { ricsName } from '../../tickets/uic/rics.ts';
import { timeOfDay } from '../../tickets/dates.ts';
import { fullName, ricsOperator, type TripField, type TripSummary, type Tables } from '../summary.ts';

const CLASSES: Record<string, string> = { '1': '1st class', '2': '2nd class' };

/**
 * An SSB1 ticket as a pass.
 *
 * The departure time is a half hour slot rather than the train's time, so the
 * pass departs on the date and the slot goes on the back as the window it is:
 * a pass saying 10:30 for a train that leaves at 10:42 would be wrong in a
 * way the ticket is not. The days carry no year, and `parseSsb1` places the
 * start nearest today and the end on or after it. A station is a UIC code or
 * a name as written; a code is named from the UIC table where it can be.
 */
export function ssb1Trip(ticket: Ssb1Ticket, tables: Tables): TripSummary | null {
	const station = (value: string) => {
		if (!value) return undefined;
		return /^\d+$/.test(value) ? (uicStationName(tables.stations, value) ?? value) : value;
	};

	const details: TripField[] = [];
	if (ticket.departureTime) {
		const [h, m] = ticket.departureTime.split(':').map(Number);
		const end = timeOfDay(h * 60 + m + 29);
		details.push({ label: 'Departs', value: `between ${ticket.departureTime} and ${end}` });
	}
	const travellers = fullName(
		ticket.numAdults ? `${ticket.numAdults} adult${ticket.numAdults === 1 ? '' : 's'}` : null,
		ticket.numChildren ? `${ticket.numChildren} child${ticket.numChildren === 1 ? '' : 'ren'}` : null
	);
	if (travellers) details.push({ label: 'Travellers', value: travellers });
	if (ticket.returnIncluded) details.push({ label: 'Return', value: 'included' });
	if (ticket.reservationReference) {
		details.push({ label: 'Reservation', value: String(ticket.reservationReference) });
	}
	if (ticket.specimen) {
		details.push({ label: 'Specimen', value: 'sample ticket, not valid for travel' });
	}

	const from = station(ticket.departureStation);
	const to = station(ticket.arrivalStation);
	if (!from && !to && !ticket.validFrom) return null;

	return {
		shape: from && to ? 'journey' : 'period',
		issuer: ricsName(ticket.issuerRics, tables.issuerNames) ?? `RICS ${ticket.issuerRics}`,
		operator: ricsOperator(ticket.issuerRics),
		from,
		to,
		departure: ticket.trainNumber ? (ticket.validFrom ?? undefined) : undefined,
		validFrom: ticket.trainNumber ? undefined : (ticket.validFrom ?? undefined),
		validUntil:
			ticket.validUntil && ticket.validUntil !== ticket.validFrom ? ticket.validUntil : undefined,
		train: ticket.trainNumber ? String(ticket.trainNumber) : undefined,
		coach: ticket.coachNumber ? String(ticket.coachNumber) : undefined,
		seat: ticket.seat || undefined,
		travelClass: ticket.travelClass ? (CLASSES[ticket.travelClass] ?? ticket.travelClass) : undefined,
		reference: ticket.pnr || undefined,
		details
	};
}
