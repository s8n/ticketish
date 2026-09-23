// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for ELB tickets (SNCF card stock and Eurostar). */
import { elbClassLabel, elbIssuer, type ElbSegment, type ElbTicket } from '../../tickets/elb/elb.ts';
import { benerailStationName } from '../../tickets/stations.ts';
import { fmtDateOrNull } from '../../tickets/format.ts';
import { fullName, type TripField, type TripSummary, type Tables } from '../summary.ts';

/**
 * An ELB ticket as a pass: the outward leg is the journey, and a return leg
 * goes on the back in one line.
 *
 * The record dates a leg by the day of the year and carries no time, so the
 * departure is a date, the way a flexible FCB ticket's is. The year is the
 * one the record's year digit and issue day settle on, which `parseElb`
 * works out. No operator code goes on the pass: the record names its issuer
 * only by the prefix of its ticket number, and a colour taken from a guess
 * about which company code that is would be worse than the app's own.
 */
export function elbTrip(ticket: ElbTicket, tables: Tables): TripSummary | null {
	const outward = ticket.segments[0];
	if (!outward) return null;
	const inward = ticket.segments[1];

	// the mnemonic is what the barcode carries, so it stands in for a name the
	// table does not have rather than a guess at one
	const station = (code: string) =>
		code.trim() ? (benerailStationName(tables.benerailStations, code) ?? code) : undefined;
	const place = (s: ElbSegment) =>
		[s.coach && `coach ${s.coach}`, s.seat && `seat ${s.seat}`].filter(Boolean).join(', ');

	const details: TripField[] = [];
	if (inward) {
		const leg = [
			`${station(inward.departureStation) ?? '?'} to ${station(inward.arrivalStation) ?? '?'}`,
			inward.trainNumber && `train ${inward.trainNumber}`,
			fmtDateOrNull(inward.departureDate),
			place(inward),
			elbClassLabel(inward.travelClass)
		].filter(Boolean);
		details.push({ label: 'Return', value: leg.join(', ') });
	}
	const passengers = fullName(
		ticket.numAdults ? `${ticket.numAdults} adult${ticket.numAdults > 1 ? 's' : ''}` : null,
		ticket.numChildren ? `${ticket.numChildren} child${ticket.numChildren > 1 ? 'ren' : ''}` : null
	);
	if (passengers) details.push({ label: 'Passengers', value: passengers });
	if (ticket.ticketInSequence && ticket.ticketsInSequence && ticket.ticketsInSequence > 1) {
		details.push({ label: 'Ticket', value: `${ticket.ticketInSequence} of ${ticket.ticketsInSequence}` });
	}
	if (outward.tariffCode) details.push({ label: 'Tariff', value: outward.tariffCode });
	if (outward.classOfService) details.push({ label: 'Service', value: outward.classOfService });
	if (ticket.specimen) {
		details.push({ label: 'Specimen', value: 'sample ticket, not valid for travel' });
	}

	return {
		shape: 'journey',
		issuer: elbIssuer(ticket.ticketCode),
		from: station(outward.departureStation),
		to: station(outward.arrivalStation),
		departure: outward.departureDate ?? undefined,
		train: outward.trainNumber || undefined,
		coach: outward.coach || undefined,
		seat: outward.seat || undefined,
		travelClass: elbClassLabel(outward.travelClass) ?? undefined,
		validFrom: ticket.validFrom ?? undefined,
		validUntil: ticket.validUntil ?? undefined,
		ticketId: `${ticket.ticketCode}${ticket.ticketNumber}`,
		reference: ticket.pnr.trim() || undefined,
		details
	};
}
