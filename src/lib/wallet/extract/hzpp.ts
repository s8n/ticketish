// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for HŽPP tickets. */
import type { HzppSegment, HzppTicket } from '../../tickets/hzpp/hzpp.ts';
import { uicStationLabel } from '../../tickets/stations.ts';
import { localInZone } from '../../tickets/format.ts';
import type { TripField, TripSummary, Tables } from '../summary.ts';

/** HŽPP's instants are read where the train runs. */
const HZPP_ZONE = 'Europe/Zagreb';

/**
 * A plaintext HŽPP ticket as a pass. The encrypted form cannot be read, so it
 * gets none.
 *
 * The outward segment is the journey, with its first train and seat where the
 * ticket reserves one; further trains and the return leg go on the back.
 * There is no departure time in the record, only the ticket's validity, which
 * is an instant and so becomes Croatian local time with the offset that
 * applied, the way a NOVA ticket's does.
 */
export function hzppTrip(ticket: HzppTicket, tables: Tables): TripSummary | null {
	if (ticket.encrypted) return null;
	const [outward, inward] = ticket.segments;

	const station = (id: number) => uicStationLabel(tables.stations, id) ?? String(id);
	const local = (iso: string | null) => (iso ? localInZone(Date.parse(iso), HZPP_ZONE) : null);
	const validFrom = local(ticket.validFrom);
	const validUntil = local(ticket.validUntil);
	const trainLine = (s: HzppSegment) =>
		s.trains
			.map((t) => [`train ${t.trainNumber}`, t.seat && `seat ${t.seat}`].filter(Boolean).join(', '))
			.join('; ');

	const details: TripField[] = [];
	const passengers = ticket.passengers.map((p) => `${p.count} × ${p.passengerTypeName}`).join(', ');
	if (passengers) details.push({ label: 'Passengers', value: passengers });
	if (outward?.trainTypeName) details.push({ label: 'Train type', value: outward.trainTypeName });
	if (outward && outward.trains.length > 1) {
		details.push({ label: 'Trains', value: trainLine(outward) });
	}
	if (outward?.routeNumber) details.push({ label: 'Via route', value: String(outward.routeNumber) });
	if (inward) {
		const leg = [
			`${station(inward.originStation)} to ${station(inward.destinationStation)}`,
			trainLine(inward),
			inward.travelClassName
		].filter(Boolean);
		details.push({ label: 'Return', value: leg.join(', ') });
	}
	if (ticket.extendedValidity) details.push({ label: 'Extended validity', value: 'yes' });
	if (ticket.issuedOnBoard) details.push({ label: 'Bought on board', value: 'yes' });

	const first = outward?.trains[0];
	return {
		shape: outward ? 'journey' : 'period',
		issuer: 'HŽPP',
		product: ticket.ticketTypeName,
		from: outward ? station(outward.originStation) : undefined,
		to: outward ? station(outward.destinationStation) : undefined,
		train: first ? String(first.trainNumber) : undefined,
		seat: first?.seat ?? undefined,
		travelClass: outward?.travelClassName || undefined,
		validFrom: validFrom?.local,
		validUntil: validUntil?.local,
		startUtcOffset: validFrom?.utcOffset,
		endUtcOffset: validUntil?.utcOffset,
		ticketId: ticket.ticketNumber,
		price: `${(ticket.price / 100).toFixed(2)} ${ticket.currency}`,
		details
	};
}
