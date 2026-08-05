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
 * Only UIC 918.3 / DOSIPAS, VDV-KA, SwissPass and Renfe are mapped so far. All
 * are read from what the parsers already produce; nothing is re-parsed here.
 */
import type { ParsedRecord, ParsedTicket, TicketContainer } from '../tickets/types.ts';
import type { DbBlData } from '../tickets/records/dbbl.ts';
import type { HeadData } from '../tickets/records/uhead.ts';
import type { FlexData } from '../tickets/records/uflex.ts';
import type { FcbTicket, Traveler } from '../tickets/model.ts';
import { summarizeFcb, type DocumentSummary } from '../tickets/model.ts';
import type { VdvBarcode, VdvTicket } from '../tickets/vdv/vdv.ts';
import type { SwissPassTicket } from '../tickets/swisspass/swisspass.ts';
import { novaOrgName } from '../tickets/swisspass/swisspass.ts';
import type { RenfeTicket } from '../tickets/renfe/renfe.ts';
import { loadRenfeStations, renfeStationName } from '../tickets/renfe/stations.ts';
import type { RenfeStationTable } from '../tickets/renfe/stations.ts';
import { localInZone } from '../tickets/format.ts';
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
	/**
	 * Minutes east of UTC for the times below, where the format says. FCB
	 * carries it and nothing else here does, so it is usually absent and the
	 * times are then a wall clock with no zone attached to it.
	 */
	utcOffset?: number;
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
	renfeStations: RenfeStationTable | null;
}

type Kind = TicketContainer['kind'];
type Of<K extends Kind> = Extract<TicketContainer, { kind: K }>;

interface Extractor<K extends Kind> {
	/** Which on-demand tables this mapping wants before it runs. */
	needs?: ('stations' | 'vdvOrgs' | 'vdvProducts' | 'renfeStations')[];
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

	out.utcOffset = fcbUtcOffset(
		(doc?.data.departureUTCOffset ?? doc?.data.validFromUTCOffset) as number | undefined
	);
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

// ------------------------------------------------------- SwissPass ------

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
function swissTrip(ticket: SwissPassTicket): TripSummary | null {
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
		issuer: ricsName(ticket.keyMeta?.rics) ?? novaOrgName(data.sale?.issuingOrg) ?? 'SwissPass',
		operator: novaOperator(data, ticket.keyMeta?.rics),
		utcOffset: validFrom?.utcOffset,
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

// ----------------------------------------------------------- Renfe ------

/**
 * The RICS codes Renfe issues under, which are the only values of the
 * barcode's company code this app will treat as RICS codes.
 *
 * The field was read off a ticket rather than out of a specification, so what
 * numbering space it belongs to is an assumption: 01071 on a Renfe ticket
 * matching Renfe Viajeros' RICS code is good evidence and not proof. Matching
 * it against the whole register would turn a bad assumption into a pass in
 * another operator's colour, which is the one failure `colors.ts` exists to
 * avoid, so the check runs the other way round and only recognises Renfe.
 */
const RENFE_RICS = new Set([71, 1071]);

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
function renfeTrip(ticket: RenfeTicket, tables: Tables): TripSummary | null {
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
		issuer: (operator && ricsName(operator.code)) || 'Renfe',
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
	swisspass: { map: (c) => swissTrip(c.ticket) },
	renfe: {
		needs: ['renfeStations'],
		map: (c, tables) => renfeTrip(c.ticket, tables)
	},
	// Everything below reads fine in the app but has no wallet mapping yet.
	// Adding one is a matter of writing the extractor above and pointing the
	// entry at it; leaving it null keeps the button hidden.
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
	const [stations, vdvOrgs, vdvProducts, renfeStations] = await Promise.all([
		needs.has('stations') ? loadUicStations() : null,
		needs.has('vdvOrgs') ? loadVdvOrgs() : null,
		needs.has('vdvProducts') ? loadVdvProducts() : null,
		needs.has('renfeStations') ? loadRenfeStations() : null
	]);

	return entry.map(container, { stations, vdvOrgs, vdvProducts, renfeStations });
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
 * FCB's UTC offset as minutes east of UTC.
 *
 * The field counts quarter hours and runs the other way: the spec defines it
 * as `UTC = local + offset * 15 minutes`, so a German summer departure is
 * written -8 and means UTC+2. It is the only zone information any of these
 * formats carries, which is why every time in this model is otherwise a bare
 * wall clock.
 */
export function fcbUtcOffset(value: number | undefined): number | undefined {
	// subtracted rather than negated, so UTC itself comes out as 0 and not -0
	return typeof value === 'number' ? 0 - value * 15 : undefined;
}

/** Minutes east of UTC as "+02:00", the way every standard here writes it. */
export function utcOffsetLabel(minutes: number): string {
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(minutes);
	return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
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
 * The same value as an ISO 8601 instant.
 *
 * With an offset this is exact: the ticket said when, in a zone, and the
 * moment follows. Without one it is a guess, and reading the wall clock as
 * UTC is the guess that never moves a displayed time, since a wallet showing
 * an instant with a zero offset prints the hour the ticket printed. The cost
 * of the guess is that a relevance notification can fire at the wrong local
 * hour, which is why the visible fields carry the wall clock rather than
 * letting the platform format the instant.
 */
export function asUtcInstant(value: string | undefined, offsetMinutes?: number): string | null {
	const parts = localParts(value);
	if (!parts) return null;
	const local = `${parts.date}T${parts.time ?? '00:00'}:00`;
	if (offsetMinutes === undefined) return `${local}Z`;
	const instant = Date.parse(`${local}Z`) - offsetMinutes * 60_000;
	return new Date(instant).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** Today, as the pass writers date things they have no date for. */
export function isoNow(now: Date = new Date()): string {
	return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}
