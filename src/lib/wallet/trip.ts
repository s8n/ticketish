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
 * That choice is made here, per format, by hand. `EXTRACTORS` is keyed by
 * every container kind, so a new format is a compile error until someone
 * decides what its pass would say - and `null` is a valid decision. A format
 * without a mapping is not exported at all rather than exported badly: a pass
 * showing a barcode over the wrong stations is worse than no pass, because a
 * ticket inspector reads the pass.
 *
 * Only UIC 918.3 / DOSIPAS and VDV-KA are mapped so far. Both are read from
 * the records the parsers already produce; nothing is re-parsed here.
 */
import type { ParsedRecord, ParsedTicket, TicketContainer } from '../tickets/types.ts';
import type { DbBlData } from '../tickets/records/dbbl.ts';
import type { HeadData } from '../tickets/records/uhead.ts';
import type { FlexData } from '../tickets/records/uflex.ts';
import type { FcbTicket, Traveler } from '../tickets/model.ts';
import { summarizeFcb, type DocumentSummary } from '../tickets/model.ts';
import type { VdvBarcode, VdvTicket } from '../tickets/vdv/vdv.ts';
import { ricsName } from '../tickets/uic/rics.ts';
import { loadVdvOrgs, vdvOrgName } from '../tickets/vdv/orgs.ts';
import { loadVdvProducts, vdvProductName } from '../tickets/vdv/products.ts';
import { loadUicStations, uicStationName, isUicCodeTable } from '../tickets/stations.ts';
import type { StationTable } from '../tickets/stations.ts';
import { pad } from '../tickets/dates.ts';
import type { OperatorCode } from './colors.ts';

/** A labelled row for the back of the pass, where anything unmapped goes. */
export interface TripField {
	label: string;
	value: string;
}

/**
 * A ticket reduced to what a wallet pass can show.
 *
 * Times are ISO local strings without a zone, because that is what the
 * formats carry: none of them says which zone its wall clock is in. Turning
 * them into instants happens at the last moment, in the pass writers, where
 * each platform's rules about zones apply.
 */
export interface TripSummary {
	/**
	 * A journey has a departure to show; a period ticket has an area and a
	 * date range. Apple and Google both lay the two out differently.
	 */
	shape: 'journey' | 'period';
	issuer: string;
	/**
	 * The issuer as a code rather than a name, where the format carries one.
	 * Names vary by year and by subsidiary; the code is what a colour or any
	 * other per-operator decision should key on.
	 */
	operator?: OperatorCode;
	product?: string;
	travelClass?: string;
	passenger?: string;
	from?: string;
	to?: string;
	via?: string;
	departure?: string;
	arrival?: string;
	train?: string;
	coach?: string;
	seat?: string;
	validFrom?: string;
	validUntil?: string;
	ticketId?: string;
	/** Booking reference: the issuer's PNR, where the format carries one. */
	reference?: string;
	price?: string;
	details: TripField[];
}

/** Tables a mapping may need, loaded before it runs so it can stay direct. */
interface Tables {
	stations: StationTable | null;
	vdvOrgs: Record<string, string> | null;
	vdvProducts: Record<string, string> | null;
}

type Kind = TicketContainer['kind'];
type Of<K extends Kind> = Extract<TicketContainer, { kind: K }>;

interface Extractor<K extends Kind> {
	/** Which on-demand tables this mapping wants before it runs. */
	needs?: ('stations' | 'vdvOrgs' | 'vdvProducts')[];
	map: (container: Of<K>, tables: Tables) => TripSummary | null;
}

// ------------------------------------------------------------- UIC ------

const CLASS_NAMES: Record<string, string> = {
	first: '1st class',
	second: '2nd class',
	tourist: 'Tourist',
	comfort: 'Comfort',
	business: 'Business',
	all: 'Any class',
	premiumFirst: 'Premium 1st',
	premiumSecond: 'Premium 2nd',
	standard: 'Standard',
	standardPremium: 'Standard Premium'
};

const travelClass = (code: unknown): string | undefined =>
	typeof code === 'string' ? (CLASS_NAMES[code] ?? code) : undefined;

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
function stationName(
	data: Record<string, unknown>,
	side: 'from' | 'to',
	tables: Tables
): string | undefined {
	const utf8 = data[`${side}StationNameUTF8`];
	if (typeof utf8 === 'string' && utf8) return utf8;
	const ia5 = data[`${side}StationIA5`];
	if (typeof ia5 === 'string' && ia5) return ia5;
	const num = data[`${side}StationNum`];
	if (typeof num !== 'number') return undefined;
	if (isUicCodeTable(data.stationCodeTable as string | undefined)) {
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
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined && value !== '' && target[key as keyof TripSummary] === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(target as any)[key] = value;
		}
	}
}

function uicTrip(records: ParsedRecord[], issuerRics: number | string | null, tables: Tables) {
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

	const issuer = parts.issuer ?? ricsName(issuerRics) ?? 'Rail ticket';
	// A route makes it a journey even without a departure time: a flexible
	// ticket between two stations is still a trip from one to the other, and
	// showing it as an area pass would throw the route away.
	const journey = !!parts.departure || !!(parts.from && parts.to);
	return {
		shape: journey ? 'journey' : ('period' as const),
		...parts,
		issuer,
		operator: ricsOperator(issuerRics),
		details
	} as TripSummary;
}

/** The envelope's issuer as a code, where it is one. DOSIPAS writes it as text. */
function ricsOperator(issuerRics: number | string | null): OperatorCode | undefined {
	const code = typeof issuerRics === 'string' ? Number(issuerRics) : issuerRics;
	return typeof code === 'number' && Number.isInteger(code) && code > 0
		? { scheme: 'rics', code }
		: undefined;
}

// ------------------------------------------------------------- VDV ------

/**
 * VDV tickets are area passes: a product valid in a region for a period, with
 * no route in the barcode at all. The Deutschlandticket is the one everybody
 * has. Mapping it to a journey with empty stations would look broken, so it
 * gets the period shape and the product name does the talking.
 */
function vdvTrip(barcode: VdvBarcode, tables: Tables): TripSummary | null {
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

	const details: TripField[] = [
		{ label: 'Ticket number', value: String(ticket.ticketId) },
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

// --------------------------------------------------------- registry -----

/**
 * One entry per container kind. `null` means "no pass for this format", which
 * is a decision rather than an oversight: see the note at the top.
 */
const EXTRACTORS: { [K in Kind]: Extractor<K> | null } = {
	uic9183: {
		needs: ['stations'],
		map: (c, tables) => uicTrip(c.envelope.records, c.envelope.issuerRics || null, tables)
	},
	dosipas: {
		needs: ['stations'],
		map: (c, tables) => uicTrip(c.envelope.records, c.envelope.securityProvider, tables)
	},
	vdv: {
		needs: ['vdvOrgs', 'vdvProducts'],
		map: (c, tables) => vdvTrip(c.barcode, tables)
	},
	// Everything below reads fine in the app but has no wallet mapping yet.
	// Adding one is a matter of writing the extractor above and pointing the
	// entry at it; leaving it null keeps the button hidden.
	rsp6: null,
	swisspass: null,
	ssb: null,
	ssb1: null,
	renfe: null,
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
	const [stations, vdvOrgs, vdvProducts] = await Promise.all([
		needs.has('stations') ? loadUicStations() : null,
		needs.has('vdvOrgs') ? loadVdvOrgs() : null,
		needs.has('vdvProducts') ? loadVdvProducts() : null
	]);

	return entry.map(container, { stations, vdvOrgs, vdvProducts });
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
	const at = (value: string | undefined) => value?.replace('T', ' ');
	const rows: [string, string | undefined][] = [
		// the pass says ticketish for itself; this is what it says about the
		// operator, which is the part that comes off the ticket
		['Operator', trip.issuer],
		['Ticket', trip.product],
		['From', trip.from],
		['To', trip.to],
		['Route', trip.via],
		['Train', trip.train],
		['Departs', at(trip.departure)],
		['Arrives', at(trip.arrival)],
		['Class', trip.travelClass],
		['Coach', trip.coach],
		['Seat', trip.seat],
		['Passenger', trip.passenger],
		['Valid from', at(trip.validFrom)],
		['Valid until', at(trip.validUntil)],
		['Ticket number', trip.ticketId],
		['Booking reference', trip.reference],
		['Price', trip.price],
		...trip.details.map((d) => [d.label, d.value] as [string, string])
	];
	return rows.filter(([, value]) => !!value).map(([label, value]) => ({ label, value: value! }));
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

/** "Hamburg Hbf to Köln Hbf", or the product, or the issuer: a pass title. */
export function tripTitle(trip: TripSummary): string {
	if (trip.from && trip.to) return `${trip.from} to ${trip.to}`;
	return trip.product ?? trip.issuer;
}

/**
 * An ISO local date-time as the parts a pass writer needs. Returns null for
 * anything that is not a date, so a half-filled field cannot become a wrong
 * timestamp.
 */
export function localParts(
	value: string | undefined
): { date: string; time: string | null } | null {
	if (!value) return null;
	const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/);
	return m ? { date: m[1], time: m[2] ?? null } : null;
}

/**
 * The same value as an ISO 8601 instant, read as UTC.
 *
 * None of these formats records a zone, so any instant we produce is a guess.
 * Reading the issuer's wall clock as UTC is the guess that never moves a
 * displayed time: both wallets show the time as written when the offset is
 * zero, which is the point. It does mean a relevance notification could fire
 * at the wrong local hour, which is why the pass writers keep the wall clock
 * in the visible fields rather than letting the platform format the instant.
 */
export function asUtcInstant(value: string | undefined): string | null {
	const parts = localParts(value);
	if (!parts) return null;
	return `${parts.date}T${parts.time ?? '00:00'}:00Z`;
}

/** Today, as the pass writers date things they have no date for. */
export function isoNow(now: Date = new Date()): string {
	return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}
