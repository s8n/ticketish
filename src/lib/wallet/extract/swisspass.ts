// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for SwissPass (NOVA) tickets. */
import type { SwissPassTicket } from '../../tickets/swisspass/swisspass.ts';
import { novaOrgLabel } from '../../tickets/swisspass/orgs.ts';
import { localInZone } from '../../tickets/format.ts';
import { ricsName } from '../../tickets/uic/rics.ts';
import type { OperatorCode } from '../colors.ts';
import { type TripField, type TripSummary, type Tables, travelClass, ricsOperator } from '../summary.ts';

/**
 * The parts of a NOVA ticket a pass can hold.
 *
 * The decoder returns plain objects, since its schema is a wire-level map and
 * not a type. These are the fields this mapping reads, named as the decoder
 * names them, so a change there shows up here as a type error rather than as
 * an undefined on a pass.
 */
interface NovaTicket {
	ticketId?: number;
	tariff?: {
		product?: { name?: string };
		departureStation?: string;
		arrivalStation?: string;
		travelClass?: string;
		journeyType?: string;
		route?: string[];
		validFrom?: number | null;
		validUntil?: number | null;
		returnValidFrom?: number | null;
		returnValidUntil?: number | null;
		zones?: { allZones?: boolean; zoneId?: number; zoneOrg?: number }[];
		routeType?: string;
	};
	traveler?: { surname?: string; forename?: string; tariff?: string; reduction?: string };
	sale?: { sellingTime?: number | null; issuingOrg?: number };
	payment?: { currency?: string; price?: string };
	extra?: { specimen?: boolean };
	transport?: { journeyNumber?: string; carriage?: string; seats?: string[] }[];
	tariffs?: { name?: string; passengerCount?: number }[];
}

/**
 * NOVA timestamps are Swiss local time, which is the one zone the format
 * implies without writing it down: the validity of a Swiss ticket is set where
 * the ticket is valid.
 */
const NOVA_ZONE = 'Europe/Zurich';

/**
 * The organisation a NOVA pass should look like it came from.
 *
 * A zone ticket is the tariff association's product and carries its id on
 * every zone, so that is the operator a passenger would name. Anything else is
 * the railway's, and either the selling organisation or the company code
 * beside the signing key says which railway.
 */
function novaOperator(data: NovaTicket, rics: string | undefined): OperatorCode | undefined {
	const orgs = new Set((data.tariff?.zones ?? []).map((z) => z.zoneOrg).filter((o) => !!o));
	const zoneOrg = orgs.size === 1 ? [...orgs][0] : undefined;
	const code = zoneOrg ?? data.sale?.issuingOrg;
	if (typeof code === 'number' && code > 0) return { scheme: 'nova', code };
	return ricsOperator(rics ?? null);
}

/**
 * A SwissPass ticket as a pass.
 *
 * Two things make this format easier than the others: the stations are already
 * names rather than codes, so no table has to load, and the timestamps are
 * instants rather than wall clocks, so the offset on the pass is a fact rather
 * than an omission.
 *
 * What it does not carry is a departure time. A Swiss ticket is valid over a
 * window, not for one train, so `departure` stays empty and the route plus the
 * validity do the work. That still makes it a journey when it names two
 * stations, on the same reasoning as a flexible UIC ticket.
 */
export function swissTrip(ticket: SwissPassTicket, tables: Tables): TripSummary | null {
	const data = ticket.ticketData as unknown as NovaTicket;
	const tariff = data.tariff ?? {};

	const from = tariff.departureStation || undefined;
	const to = tariff.arrivalStation || undefined;
	const product = tariff.product?.name || undefined;
	const validFrom = localInZone(tariff.validFrom, NOVA_ZONE);
	const validUntil = localInZone(tariff.validUntil, NOVA_ZONE);

	// Nothing to put on a pass but a barcode: better to offer no pass at all.
	if (!from && !product && !validFrom) return null;

	const passenger =
		[data.traveler?.forename, data.traveler?.surname].filter(Boolean).join(' ') || undefined;
	const leg = data.transport?.[0];
	const zones = (tariff.zones ?? []).filter((z) => z.zoneId !== undefined);

	const details: TripField[] = [];
	const reduction = data.traveler?.reduction || data.traveler?.tariff;
	if (reduction) details.push({ label: 'Reduction', value: reduction });
	for (const t of data.tariffs ?? []) {
		if (t.name) {
			details.push({
				label: 'Travellers',
				value: t.passengerCount ? `${t.passengerCount} × ${t.name}` : t.name
			});
		}
	}
	if (zones.length) {
		details.push({ label: 'Zones', value: zones.map((z) => z.zoneId).join(', ') });
	} else if (tariff.zones?.some((z) => z.allZones)) {
		details.push({ label: 'Zones', value: 'all' });
	}
	// A pass has one direction, so the return half would otherwise be dropped
	// silently: it goes on the back rather than nowhere.
	const returnFrom = localInZone(tariff.returnValidFrom, NOVA_ZONE);
	const returnUntil = localInZone(tariff.returnValidUntil, NOVA_ZONE);
	if (returnFrom || returnUntil) {
		details.push({
			label: 'Return valid',
			value: [returnFrom?.local, returnUntil?.local]
				.filter(Boolean)
				.map((v) => v!.replace('T', ' '))
				.join(' to ')
		});
	} else if (tariff.journeyType === 'return' || tariff.journeyType === 'twoWay') {
		details.push({ label: 'Journey', value: 'return' });
	}
	// The pass shows the first leg, which is the one it has fields for; the
	// rest are named here so the pass does not read as a single-leg ticket.
	const further = (data.transport ?? [])
		.slice(1)
		.map((t) => [t.journeyNumber, t.carriage && `carriage ${t.carriage}`].filter(Boolean).join(' '))
		.filter(Boolean);
	if (further.length) details.push({ label: 'Further legs', value: further.join(', ') });
	const sold = localInZone(data.sale?.sellingTime, NOVA_ZONE);
	if (sold) details.push({ label: 'Issued', value: sold.local.replace('T', ' ') });
	if (data.extra?.specimen) {
		details.push({ label: 'Specimen', value: 'sample ticket, not valid for travel' });
	}

	return {
		shape: from && to ? 'journey' : 'period',
		// Who sold it before whoever signed it, the same way `novaOperator`
		// below picks the code the colour keys on.
		issuer:
			novaOrgLabel(tables.novaOrgs, data.sale?.issuingOrg) ??
			ricsName(ticket.keyMeta?.rics, tables.issuerNames) ??
			'SwissPass',
		operator: novaOperator(data, ticket.keyMeta?.rics),
		startUtcOffset: validFrom?.utcOffset,
		endUtcOffset: validUntil?.utcOffset,
		product,
		travelClass: travelClass(tariff.travelClass),
		passenger,
		from,
		to,
		via: tariff.route?.filter(Boolean).join(', ') || undefined,
		validFrom: validFrom?.local,
		validUntil: validUntil?.local,
		train: leg?.journeyNumber || undefined,
		coach: leg?.carriage || undefined,
		seat: leg?.seats?.filter(Boolean).join(', ') || undefined,
		ticketId: data.ticketId === undefined ? undefined : String(data.ticketId),
		price: data.payment?.price
			? [data.payment.price, data.payment.currency].filter(Boolean).join(' ')
			: undefined,
		details
	};
}
