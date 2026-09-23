// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for TCDD e-tickets. */
import type { TcddTicket } from '../../tickets/tcdd/tcdd.ts';
import { tcddStationName } from '../../tickets/tcdd/stations.ts';
import type { TripField, TripSummary, Tables } from '../summary.ts';

/**
 * A TCDD e-ticket as a pass: a seat on a named train on a date.
 *
 * Both layouts carry the train, the stations and the departure, which is a
 * date and time except where the newer layout writes a zeroed time, and then
 * a date alone. A station is named from TCDD's table, or for the older
 * layout's retired ids from the few names known, and otherwise shown by its
 * number the way the ticket view shows it. Times are Turkish local with no
 * zone given, so none goes on the pass.
 */
export function tcddTrip(ticket: TcddTicket, tables: Tables): TripSummary | null {
	const station = (code: string) => (code ? tcddStationName(tables.tcddStations, code) : undefined);

	const details: TripField[] = [];
	if (ticket.fullPrice && ticket.fullPrice !== ticket.price) {
		details.push({ label: 'Full fare', value: `${ticket.fullPrice} TRY` });
	}

	return {
		shape: 'journey',
		issuer: 'TCDD Taşımacılık',
		from: station(ticket.originCode),
		to: station(ticket.destinationCode),
		departure: ticket.departure ?? undefined,
		train: ticket.trainNumber || undefined,
		coach: ticket.coach || undefined,
		seat: ticket.seat || undefined,
		ticketId: ticket.ticketNumber || undefined,
		reference: ticket.pnr || undefined,
		price: ticket.price ? `${ticket.price} TRY` : undefined,
		details
	};
}
