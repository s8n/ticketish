// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The wallet mapping for UIC 918.3 and DOSIPAS: FCB first, DB's 0080BL where it is silent. */
import type { ParsedRecord } from '../../tickets/types.ts';
import type { DbBlData } from '../../tickets/records/dbbl.ts';
import type { HeadData } from '../../tickets/records/uhead.ts';
import type { FlexData } from '../../tickets/records/uflex.ts';
import {
	type DocumentSummary,
	type FcbDocument,
	type FcbTicket,
	type Traveler,
	summarizeFcb
} from '../../tickets/model.ts';
import { ricsName } from '../../tickets/uic/rics.ts';
import { uicStationName, isUicCodeTable } from '../../tickets/stations.ts';
import { type TripField, type TripSummary, type Tables, travelClass, ricsOperator } from '../summary.ts';
import { fcbUtcOffset } from '../time.ts';

/** FCB prices are minor units, with the fraction digits set on the issuer. */
function money(amount: unknown, currency: string | undefined, fract: unknown): string | undefined {
	if (typeof amount !== 'number') return undefined;
	const digits = typeof fract === 'number' ? fract : 2;
	const scaled = digits > 0 ? (amount / 10 ** digits).toFixed(digits) : String(amount);
	return currency ? `${scaled} ${currency}` : scaled;
}

function travellerName(t: Traveler | undefined): string | undefined {
	if (!t) return undefined;
	const parts = [t.firstName, t.secondName, t.lastName].filter(Boolean);
	return parts.length ? parts.join(' ') : undefined;
}

const record = (records: ParsedRecord[], kind: string): ParsedRecord | undefined =>
	records.find((r) => r.kind === kind && !r.error);

/**
 * The document a pass should be about. A ticket can hold several, and the one
 * worth showing is the one with a train to catch: a reservation over an open
 * ticket, and anything at all over a customer card, which is not a journey.
 */
function leadDocument(docs: DocumentSummary[]): DocumentSummary | undefined {
	return (
		docs.find((d) => d.type === 'reservation') ??
		docs.find((d) => d.type !== 'customerCard') ??
		docs[0]
	);
}

/** Station name from whichever of the three ways a document names one. */
function stationName(data: FcbDocument, side: 'from' | 'to', tables: Tables): string | undefined {
	const [utf8, ia5, num] =
		side === 'from'
			? [data.fromStationNameUTF8, data.fromStationIA5, data.fromStationNum]
			: [data.toStationNameUTF8, data.toStationIA5, data.toStationNum];
	if (utf8) return utf8;
	if (ia5) return ia5;
	if (num === undefined) return undefined;
	if (isUicCodeTable(data.stationCodeTable)) {
		return uicStationName(tables.stations, num) ?? String(num);
	}
	return String(num);
}

function fromFcb(flex: FlexData, tables: Tables): Partial<TripSummary> {
	const ticket = flex.ticket as FcbTicket;
	const issuing = ticket.issuingDetail;
	const docs = summarizeFcb(ticket, tables.stations);
	const doc = leadDocument(docs);
	const out: Partial<TripSummary> = {};

	// FCB leaves out the end's offset where it is the same as the start's
	const startOffset = doc?.data.departureUTCOffset ?? doc?.data.validFromUTCOffset;
	const endOffset = doc?.data.arrivalUTCOffset ?? doc?.data.validUntilUTCOffset;
	out.startUtcOffset = fcbUtcOffset(startOffset);
	out.endUtcOffset = fcbUtcOffset(endOffset ?? startOffset);
	out.passenger = travellerName(ticket.travelerDetail?.traveler?.[0]);
	if (issuing.issuerPNR) out.reference = issuing.issuerPNR;
	if (issuing.issuerName) out.issuer = issuing.issuerName;

	if (!doc) return out;
	const data = doc.data;

	out.validFrom = doc.validFrom;
	out.validUntil = doc.validUntil;
	out.travelClass = travelClass(data.classCode);
	out.price = money(data.price, issuing.currency, issuing.currencyFract);

	const product = data.productIdIA5 ?? data.serviceBrandNameUTF8 ?? data.serviceBrandAbrUTF8;
	if (typeof product === 'string' && product) out.product = product;

	const reference = data.referenceIA5 ?? data.referenceNum;
	if (reference !== undefined && !out.reference) out.reference = String(reference);

	out.from = stationName(data, 'from', tables);
	out.to = stationName(data, 'to', tables);
	if (typeof data.validRegionDesc === 'string' && data.validRegionDesc) {
		out.via = data.validRegionDesc;
	}

	// A reservation is a train to catch; the binding on an open ticket is the
	// same fact in a different place, so both end up in the same fields.
	const binding = doc.trainBindings[0];
	if (binding) {
		out.train = binding.train;
		out.departure = `${binding.departureDate}T${binding.departureTime}`;
		out.from ??= binding.fromStation;
		out.to ??= binding.toStation;
	}
	if (doc.type === 'reservation') {
		out.departure ??= doc.validFrom;
		out.arrival = doc.validUntil;
		// a reservation's validity window is its departure and arrival, which
		// are already shown as such
		out.validFrom = undefined;
		out.validUntil = undefined;
	}

	const places = data.places as { coach?: string; placeString?: string } | undefined;
	if (places?.coach) out.coach = places.coach;
	if (places?.placeString) out.seat = places.placeString;

	return out;
}

function fromDbBl(bl: DbBlData): Partial<TripSummary> {
	const out: Partial<TripSummary> = {};
	if (bl.product) out.product = bl.product;
	if (bl.fromStationName) out.from = bl.fromStationName;
	if (bl.toStationName) out.to = bl.toStationName;
	if (bl.route) out.via = bl.route;
	if (bl.validityStart) out.validFrom = bl.validityStart;
	if (bl.validityEnd) out.validUntil = bl.validityEnd;
	if (bl.serviceClass) out.travelClass = bl.serviceClass === 'first' ? '1st class' : '2nd class';
	const name =
		bl.travellerFullName ??
		[bl.travellerForename, bl.travellerSurname].filter(Boolean).join(' ');
	if (name) out.passenger = name;
	return out;
}

function dbBlDetails(bl: DbBlData): TripField[] {
	const details: TripField[] = [];
	if (bl.priceLevel) details.push({ label: 'Fare', value: bl.priceLevel });
	if (bl.bahncardType) details.push({ label: 'Railcard', value: bl.bahncardType });
	const heads = [
		bl.numAdults && `${bl.numAdults} adult${bl.numAdults === 1 ? '' : 's'}`,
		bl.numChildren && `${bl.numChildren} child${bl.numChildren === 1 ? '' : 'ren'}`
	].filter(Boolean);
	if (heads.length) details.push({ label: 'Travellers', value: heads.join(', ') });
	if (bl.returnFromStationName && bl.returnToStationName) {
		details.push({
			label: 'Return',
			value: `${bl.returnFromStationName} to ${bl.returnToStationName}`
		});
	}
	return details;
}

/**
 * Merge a lower-priority source in: a field already filled by a richer record
 * wins, because the records disagree about spelling more often than about
 * substance and FCB is the one with code tables behind it.
 */
function fill(target: Partial<TripSummary>, source: Partial<TripSummary>): void {
	for (const key of Object.keys(source) as (keyof TripSummary)[]) {
		const value = source[key];
		if (value !== undefined && value !== '' && target[key] === undefined) {
			Object.assign(target, { [key]: value });
		}
	}
}

export function uicTrip(
	records: ParsedRecord[],
	issuerRics: number | string | null,
	tables: Tables
): TripSummary | null {
	const parts: Partial<TripSummary> = {};
	const details: TripField[] = [];

	const flex = record(records, 'flex');
	if (flex) fill(parts, fromFcb(flex.data as FlexData, tables));

	const bl = record(records, 'db-bl');
	if (bl) {
		fill(parts, fromDbBl(bl.data as DbBlData));
		details.push(...dbBlDetails(bl.data as DbBlData));
	}

	const head = record(records, 'head');
	if (head) {
		const h = head.data as HeadData;
		if (h.ticketId) parts.ticketId ??= h.ticketId;
		if (h.issuedAt) details.push({ label: 'Issued', value: h.issuedAt.replace('T', ' ') });
	}

	// Nothing to put on a pass but a barcode: better to offer no pass at all.
	if (!parts.from && !parts.validFrom && !parts.departure && !parts.product) return null;

	const issuer = parts.issuer ?? ricsName(issuerRics, tables.issuerNames) ?? 'Rail ticket';
	// A route makes it a journey even without a departure time: a flexible
	// ticket between two stations is still a trip from one to the other, and
	// showing it as an area pass would throw the route away.
	const journey = !!parts.departure || !!(parts.from && parts.to);
	return {
		...parts,
		shape: journey ? 'journey' : 'period',
		issuer,
		operator: ricsOperator(issuerRics),
		details
	};
}
