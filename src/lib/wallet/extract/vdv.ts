// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for VDV-KA tickets. */
import type { VdvBarcode, VdvTicket } from '../../tickets/vdv/vdv.ts';
import { vdvOrgName } from '../../tickets/vdv/orgs.ts';
import { vdvProductName } from '../../tickets/vdv/products.ts';
import type { TripField, TripSummary, Tables } from '../summary.ts';

/**
 * VDV tickets are area passes: a product valid in a region for a period, with
 * no route in the barcode at all. The Deutschlandticket is the one everybody
 * has. Mapping it to a journey with empty stations would look broken, so it
 * gets the period shape and the product name does the talking.
 */
export function vdvTrip(barcode: VdvBarcode, tables: Tables): TripSummary | null {
	const ticket: VdvTicket | undefined = barcode.tickets[0];
	if (!ticket) return null;

	const issuer =
		vdvOrgName(tables.vdvOrgs, ticket.productOrgId) ?? `VDV organisation ${ticket.productOrgId}`;
	const product =
		vdvProductName(tables.vdvProducts, ticket.productOrgId, ticket.productNumber) ??
		`Product ${ticket.productNumber}`;

	const passengerElement = ticket.productData.find((e) => e.passenger)?.passenger;
	const passenger = passengerElement
		? [passengerElement.forename, passengerElement.surname].filter(Boolean).join(' ')
		: undefined;

	// the ticket number goes in ticketId, which every writer already shows
	const details: TripField[] = [
		{ label: 'Issuing organisation', value: String(ticket.ticketOrgId) }
	];
	if (passengerElement?.abbreviated) {
		details.push({
			label: 'Name',
			value: 'shortened in the barcode, as the format specifies'
		});
	}

	return {
		shape: 'period',
		issuer,
		operator: { scheme: 'vdv', code: ticket.productOrgId },
		product,
		passenger,
		validFrom: ticket.validityStart,
		validUntil: ticket.validityEnd,
		ticketId: String(ticket.ticketId),
		details
	};
}
