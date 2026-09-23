// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for VIA Rail boarding passes. */
import type { ViaRailTicket } from '../../tickets/viarail/viarail.ts';
import { fullName, type TripField, type TripSummary } from '../summary.ts';

/**
 * A VIA Rail boarding pass as a wallet pass: a named passenger in a car and
 * seat on a train at a time.
 *
 * The stations are VIA's four letter codes, and no table for them is
 * bundled, so the pass shows the codes as the ticket view does rather than a
 * guess at a name. The departure is local time at the station; the record
 * carries no zone and Canada has several, so none goes on the pass.
 */
export function viaRailTrip(ticket: ViaRailTicket): TripSummary | null {
	const details: TripField[] = [];
	if (ticket.passengerTypeLabel) {
		details.push({ label: 'Passenger type', value: ticket.passengerTypeLabel });
	}
	if (ticket.inventoryClass) details.push({ label: 'Fare class', value: ticket.inventoryClass });
	if (ticket.loyaltyLevel) details.push({ label: 'VIA Préférence', value: ticket.loyaltyLevel });

	return {
		shape: 'journey',
		issuer: 'VIA Rail Canada',
		from: ticket.departureStation || undefined,
		to: ticket.arrivalStation || undefined,
		departure: ticket.departureTime ?? undefined,
		train: ticket.train || undefined,
		coach: ticket.car || undefined,
		seat: ticket.seat || undefined,
		passenger: fullName(ticket.givenName, ticket.surname),
		ticketId: ticket.ticketNumber,
		reference: ticket.pnr || undefined,
		details
	};
}
