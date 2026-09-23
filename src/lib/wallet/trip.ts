// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The one thing a wallet pass needs that a parser does not produce: a single
 * shape that says who is travelling, from where to where, when, and on what.
 *
 * The rest of the app deliberately has no such model. Every format gets its
 * own view because every format says something slightly different, and
 * flattening them all into one set of fields would lose exactly the detail
 * those views exist to show. A wallet pass has the opposite problem: Apple and
 * Google both want a fixed handful of labelled strings, so something has to
 * choose which of a format's fields deserve them.
 *
 * That choice is made per format, by hand, in `extract/`, and `EXTRACTORS`
 * below says which one a ticket gets. It is keyed by every container kind, so
 * a new format is a compile error until someone decides what its pass would
 * say - and `null` is a valid decision. A format
 * without a mapping is not exported at all rather than exported badly: a pass
 * showing a barcode over the wrong stations is worse than no pass, because a
 * ticket inspector reads the pass.
 *
 * Only UIC 918.3 / DOSIPAS, VDV-KA, SwissPass and Renfe are mapped so far. All
 * are read from what the parsers already produce; nothing is re-parsed here.
 */
import type { ParsedTicket, TicketContainer } from '../tickets/types.ts';
import { loadNovaOrgs } from '../tickets/swisspass/orgs.ts';
import { loadRenfeStations } from '../tickets/renfe/stations.ts';
import { loadIssuerNames } from '../tickets/uic/rics.ts';
import { loadVdvOrgs } from '../tickets/vdv/orgs.ts';
import { loadVdvProducts } from '../tickets/vdv/products.ts';
import { loadUicStations } from '../tickets/stations.ts';
import type { TripField, TripSummary, Kind, Extractor } from './summary.ts';
import { uicTrip } from './extract/uic.ts';
import { vdvTrip } from './extract/vdv.ts';
import { swissTrip } from './extract/swisspass.ts';
import { renfeTrip } from './extract/renfe.ts';

export type { TripField, TripSummary } from './summary.ts';

/**
 * One entry per container kind. `null` means "no pass for this format", which
 * is a decision rather than an oversight: see the note at the top.
 */
const EXTRACTORS: { [K in Kind]: Extractor<K> | null } = {
	uic9183: {
		needs: ['stations', 'issuerNames'],
		map: (c, tables) => uicTrip(c.envelope.records, c.envelope.issuerRics || null, tables)
	},
	dosipas: {
		needs: ['stations', 'issuerNames'],
		map: (c, tables) => uicTrip(c.envelope.records, c.envelope.securityProvider, tables)
	},
	vdv: {
		needs: ['vdvOrgs', 'vdvProducts'],
		map: (c, tables) => vdvTrip(c.barcode, tables)
	},
	swisspass: {
		needs: ['issuerNames', 'novaOrgs'],
		map: (c, tables) => swissTrip(c.ticket, tables)
	},
	renfe: {
		needs: ['renfeStations', 'issuerNames'],
		map: (c, tables) => renfeTrip(c.ticket, tables)
	},
	// BoB is null for a reason of its own rather than for want of an extractor.
	// The barcode carries a device signature the issuing app re-makes every few
	// seconds, and an inspector's reader checks how recent that stamp is, so a
	// pass holding a copy of the symbol is refused however well its fields are
	// filled in. A pass that fails at the barcode is worse than no pass, and
	// nothing this app can put in one would change that.
	bob: null,
	// Everything below reads fine in the app but has no wallet mapping yet.
	// Adding one is a matter of writing the extractor above and pointing the
	// entry at it; leaving it null keeps the button hidden.
	// A BCBP record dates a flight by the day of the year and carries no time
	// at all, so a pass made from one would show a departure that was guessed
	// twice over: once for the year, once for the hour. The airline's own app
	// has both and issues the pass that boards the flight.
	bcbp: null,
	rsp6: null,
	ssb: null,
	ssb1: null,
	tcdd: null,
	trenitalia: null,
	eav: null,
	elb: null,
	mav: null,
	viarail: null,
	hzpp: null,
	'cd-legacy': null,
	nsb: null,
	uz: null,
	'sncf-eticket': null,
	// An eAU is not a journey: no traveller, no operator, nowhere to be and
	// nothing an inspector would ask for. It is in the app to be read.
	'kbv-eau': null,
	text: null,
	unknown: null
};

/** Whether this format has a mapping at all, without running it. */
export function hasMapping(container: TicketContainer): boolean {
	return EXTRACTORS[container.kind] !== null;
}

/**
 * The trip a pass would describe, or null when the format has no mapping or
 * this particular ticket did not carry enough to fill one.
 *
 * Async because the station, organisation and product tables load on demand,
 * and a pass with numeric codes where names belong is not worth writing.
 */
export async function tripFor(ticket: ParsedTicket): Promise<TripSummary | null> {
	const container = ticket.container;
	const entry = EXTRACTORS[container.kind] as Extractor<Kind> | null;
	if (!entry) return null;

	const needs = new Set(entry.needs ?? []);
	const [stations, vdvOrgs, vdvProducts, renfeStations, issuerNames, novaOrgs] = await Promise.all([
		needs.has('stations') ? loadUicStations() : null,
		needs.has('vdvOrgs') ? loadVdvOrgs() : null,
		needs.has('vdvProducts') ? loadVdvProducts() : null,
		needs.has('renfeStations') ? loadRenfeStations() : null,
		needs.has('issuerNames') ? loadIssuerNames() : null,
		needs.has('novaOrgs') ? loadNovaOrgs() : null
	]);

	return entry.map(container, {
		stations,
		vdvOrgs,
		vdvProducts,
		renfeStations,
		issuerNames,
		novaOrgs
	});
}

/**
 * Every field the pass will carry, in the order it shows them.
 *
 * This is what the reader is shown before they export, and its job is to be
 * complete: a field missing from it reads as a field the mapping dropped, and
 * checking for that is the whole reason to look before handing a pass to an
 * inspector. The title is in here because both wallets put it at the top of
 * the card, where it is the most visible thing on the pass and so the last
 * thing that should be a surprise.
 */
export function previewFields(trip: TripSummary): TripField[] {
	return tripRows(trip).map(({ label, value }) => ({ label, value }));
}

/** A filled field of the trip, with an id the writers pick rows by. */
export interface TripRow extends TripField {
	/** Stable per field; `detail0`, `detail1` and so on for the details. */
	id: string;
}

/**
 * Every filled field of the trip, labelled and in one order, for the preview
 * and for each writer to take the rows it has room for. Times are shown as
 * written, with a space for the T. Keeping the labels here is what keeps the
 * preview, the two wallets and the calendar saying the same thing.
 */
export function tripRows(trip: TripSummary): TripRow[] {
	const at = (value: string | undefined) => value?.replace('T', ' ');
	const rows: [string, string, string | undefined][] = [
		// the pass says ticketish for itself; this is what it says about the
		// operator, which is the part that comes off the ticket
		['operator', 'Operator', trip.issuer],
		['product', 'Ticket', trip.product],
		['from', 'From', trip.from],
		['to', 'To', trip.to],
		['route', 'Route', trip.via],
		['train', 'Train', trip.train],
		['departs', 'Departs', at(trip.departure)],
		['arrives', 'Arrives', at(trip.arrival)],
		['class', 'Class', trip.travelClass],
		['coach', 'Coach', trip.coach],
		['seat', 'Seat', trip.seat],
		['passenger', 'Passenger', trip.passenger],
		['validFrom', 'Valid from', at(trip.validFrom)],
		['validUntil', 'Valid until', at(trip.validUntil)],
		['ticketId', 'Ticket number', trip.ticketId],
		['reference', 'Booking reference', trip.reference],
		['price', 'Price', trip.price],
		...trip.details.map((d, i) => [`detail${i}`, d.label, d.value] as [string, string, string])
	];
	return rows
		.filter(([, , value]) => !!value)
		.map(([id, label, value]) => ({ id, label, value: value! }));
}

/**
 * Whose pass this is, as against whose ticket it came from.
 *
 * Both wallets have a slot for the party that issued the pass, separate from
 * anything the pass is about: the transit class's issuer name on Google, the
 * logo text on Apple. This app goes there, and the operator goes in the
 * fields meant for the operator. A pass carrying DB's name, DB's red and DB's
 * barcode could otherwise be taken for something DB issued, which it is not.
 */
export const APP_NAME = 'ticketish';

/** The same point at length, for the one field on the back that can hold it. */
export const UNOFFICIAL_LABEL = 'Unofficial pass';
export const UNOFFICIAL_NOTE =
	'Made by ticketish from the barcode on the original ticket. Not issued by the operator.';

/**
 * The trip title as a file name, without the extension: lower case, runs of
 * anything else as one hyphen, "ticket" when nothing is left.
 */
export function tripFileStem(trip: TripSummary): string {
	const stem = tripTitle(trip)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return stem || 'ticket';
}

/** "Hamburg Hbf to Köln Hbf", or the product, or the issuer: a pass title. */
export function tripTitle(trip: TripSummary): string {
	if (trip.from && trip.to) return `${trip.from} to ${trip.to}`;
	return trip.product ?? trip.issuer;
}
