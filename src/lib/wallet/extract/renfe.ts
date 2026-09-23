// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for Renfe tickets. */
import type { RenfeTicket } from '../../tickets/renfe/renfe.ts';
import { renfeStationName } from '../../tickets/renfe/stations.ts';
import { ricsName } from '../../tickets/uic/rics.ts';
import type { OperatorCode } from '../colors.ts';
import type { TripField, TripSummary, Tables } from '../summary.ts';

/**
 * The RICS codes Renfe issues under, which are the only values of the
 * barcode's company code this app will treat as RICS codes.
 *
 * The field was read off a ticket rather than out of a specification, so what
 * numbering space it belongs to is an assumption: 01071 on a Renfe ticket
 * matching Renfe Operadora's company code is good evidence and not proof.
 * Matching it against the whole register would turn a bad assumption into a
 * pass in another operator's colour, which is the one failure `colors.ts`
 * exists to avoid, so the check runs the other way round and only recognises
 * Renfe. `ricsName` falls back to ERA's register, so an unguarded lookup
 * would name thousands of codes confidently and wrongly.
 *
 * Do not add 71: it is ADIF, the infrastructure manager, which issues no
 * passenger tickets. Renfe Viajeros is 1171 and Renfe Mercancías 2171; neither
 * has turned up in the field, and a code goes in here when a ticket carries
 * it, not because the register lists it.
 */
const RENFE_RICS = new Set([1071]);

function renfeOperator(companyCode: string | undefined): OperatorCode | undefined {
	const code = Number(companyCode);
	return RENFE_RICS.has(code) ? { scheme: 'rics', code } : undefined;
}

/**
 * A Renfe ticket as a pass.
 *
 * Every Renfe barcode is a seat on a named train on a date, so this is always
 * a journey even in the short form, which carries the train and the seat but
 * neither the stations nor the departure time. Both wallets handle a journey
 * whose endpoints are missing, and a pass that says "train 03112, coach 18,
 * seat 15B" is the ticket: showing it as a period pass would drop the train.
 *
 * The times are Spanish local and the barcode never says so, which is the
 * usual case here, so no offset goes on the pass and the wall clock travels as
 * written.
 */
export function renfeTrip(ticket: RenfeTicket, tables: Tables): TripSummary | null {
	const departure = ticket.departureTime
		? `${ticket.departureDate}T${ticket.departureTime}`
		: ticket.departureDate;

	const from = renfeStationName(tables.renfeStations, ticket.originCode);
	const to = renfeStationName(tables.renfeStations, ticket.destinationCode);
	const operator = renfeOperator(ticket.companyCode);

	const details: TripField[] = [];
	if (ticket.verificationCode) {
		// printed under the localizador and asked for alongside it
		details.push({ label: 'Verification code', value: ticket.verificationCode });
	}
	// the company code is the pass's operator when it is one this app can name;
	// when it is not, the number goes on the back rather than nowhere
	if (ticket.companyCode && !operator) {
		details.push({ label: 'Company code', value: ticket.companyCode });
	}
	if (ticket.variant === 'qr') {
		details.push({
			label: 'Barcode',
			value: 'the short Renfe form, which carries no stations and no departure time'
		});
	}

	return {
		shape: 'journey',
		// only a code this app is willing to call Renfe's gets read as a name,
		// on the same reasoning as the operator below
		issuer: (operator && ricsName(operator.code, tables.issuerNames)) || 'Renfe',
		operator,
		// a code with no name is shown as a code, the way the ticket view shows
		// it: a pass an inspector reads should not guess at a station
		from: from ?? (ticket.originCode ? `Station ${ticket.originCode}` : undefined),
		to: to ?? (ticket.destinationCode ? `Station ${ticket.destinationCode}` : undefined),
		departure,
		train: ticket.trainNumber,
		coach: ticket.coach || undefined,
		seat: ticket.seat || undefined,
		ticketId: ticket.ticketNumber,
		reference: ticket.bookingReference || undefined,
		details
	};
}
