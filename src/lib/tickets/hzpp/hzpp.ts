// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: EUPL-1.2
// Ported from zuegli (EUPL-1.2), so it cannot also be offered under MIT.

/**
 * HŽPP (Hrvatske željeznice Putnički prijevoz) tickets, the Croatian
 * passenger railway.
 *
 * The barcode is an Aztec whose first two characters say which of two forms
 * follows:
 *
 *   B1…  plaintext, 33 pipe separated fields
 *   A1…  AES-CBC ciphertext as hex, with the IV in the last 16 bytes
 *
 * Only B1 can be read. The A1 key is not public: zuegli, which is the source
 * for all of this, takes it from an environment variable rather than
 * shipping it, and nothing here can decrypt without it. A1 tickets are still
 * recognised, so one shows as an HŽPP ticket that cannot be opened rather
 * than as an unidentified hex string. The plaintext behind it is a 608 byte
 * fixed layout holding the same fields as B1 plus the customer's name and
 * address, which is presumably why it is the encrypted one.
 *
 * Ported from zuegli's `main/hzpp/data.py` (EUPL-1.2), and since checked
 * against a plaintext ticket, which agreed on every field: a return fare
 * reads as ticket type 10003, "return trip 2nd class", with the two segments
 * that implies running opposite ways over the same route number, one
 * passenger of type 12, "adult return", and a validity window opening on the
 * day the ticket was sold. Its price is in euro, the record having been
 * issued after Croatia changed currency, which is the only way to know.
 *
 * Stations are Croatia's UIC codes with the country prefix left off, so
 * 7800000 goes back on and the bundled station table can name the larger
 * ones. Route numbers identify a list of stations a ticket is valid via;
 * that table is not bundled, so the number is shown as issued.
 */

/** 2003-01-01T00:00:00+01:00, the instant the minute counters run from. */
const HZPP_EPOCH = 1041375600;

/** Croatia adopted the euro at 2023-01-01T00:00:00+01:00. */
const EURO_SWITCHOVER = 1672527600;

/** Croatian UIC codes with the country prefix stripped out of the record. */
const UIC_PREFIX = 7800000;

const TICKET_TYPES: Record<number, string> = {
	10000: 'Single trip 1st class',
	10001: 'Single trip 2nd class',
	10002: 'Return trip 1st class',
	10003: 'Return trip 2nd class',
	10004: 'Single monthly general 1st class R',
	10005: 'Single monthly general 2nd class R',
	10006: 'Return monthly general 1st class R',
	10007: 'Return monthly general 2nd class R',
	10008: 'Single monthly student 2nd class R',
	10009: 'Single monthly student 1st class R',
	10010: 'Group 2nd class student (for one student)',
	10011: 'Return monthly P-4 1st class R',
	10012: 'Return monthly P-4 2nd class R',
	10013: 'Car type 1',
	10014: 'Car type 2',
	10015: 'Car type 3',
	10016: 'Motorcycle',
	10017: 'Single 1st class HŽ employee',
	10018: 'Single 2nd class HŽ employee',
	10019: 'Return monthly P-7 HŽPP 2nd class R',
	10020: 'Return monthly P-7 HŽPP 2nd class F',
	10021: 'Return monthly P-7 HŽ comp. R',
	10022: 'Return monthly P-7 HŽ comp. F',
	10023: 'Return monthly K-50 2nd class R',
	10024: 'Return monthly K-50 1st class R',
	10025: 'Return monthly K-50 2nd class F',
	10026: 'Return monthly K-50 1st class F',
	10027: 'Single monthly general 1st class F',
	10028: 'Single monthly general 2nd class F',
	10029: 'Return monthly general 1st class F',
	10030: 'Return monthly general 2nd class F',
	10031: 'Single monthly student 2nd class F',
	10032: 'Return monthly student 2nd class F',
	10033: 'Return monthly P-4 1st class F',
	10034: 'Return monthly P-4 2nd class F',
	10035: 'Mix class return ticket',
	10036: 'Mix return timebase'
};

const PASSENGER_TYPES: Record<number, string> = {
	11: 'Adult single',
	12: 'Adult return',
	13: 'Child',
	27: 'Journalist',
	28: 'Senior',
	29: 'Youth',
	75: 'Student'
};

const TRAVEL_CLASSES: Record<number, string> = {
	1: 'First',
	2: 'Second',
	3: 'Autotrain'
};

/** Each kind of train is numbered twice, in an old range and a newer one. */
const TRAIN_TYPES: Record<number, string> = {
	37: 'Regular train',
	100: 'Regular train',
	8: 'Fast train',
	101: 'Fast train',
	9: 'InterCity',
	102: 'InterCity'
};

export interface HzppTrain {
	trainNumber: number;
	reservationReference: string | null;
	seat: string | null;
}

export interface HzppSegment {
	/** Seven digit UIC code, the country prefix put back on. */
	originStation: number;
	destinationStation: number;
	/** Identifies a list of stations the ticket is valid via. */
	routeNumber: number | null;
	travelClass: number;
	travelClassName: string;
	trainType: number;
	trainTypeName: string;
	trains: HzppTrain[];
}

export interface HzppPassenger {
	passengerType: number;
	passengerTypeName: string;
	count: number;
}

/** An A1 ticket: recognised, but not readable without HŽPP's key. */
export interface HzppEncrypted {
	encrypted: true;
	/** Ciphertext length in bytes, the last 16 of which are the CBC IV. */
	cipherLength: number;
}

export interface HzppPlain {
	encrypted: false;
	ticketNumber: string;
	ticketType: number;
	ticketTypeName: string;
	/** Face value in minor units: 1499 is 14.99 in whichever currency. */
	price: number;
	currency: 'EUR' | 'HRK';
	validFrom: string | null;
	validUntil: string | null;
	extendedValidity: boolean;
	issuedOnBoard: boolean;
	passengers: HzppPassenger[];
	/** One entry outbound, a second for the return leg when there is one. */
	segments: HzppSegment[];
}

export type HzppTicket = HzppEncrypted | HzppPlain;

/** Fields in the plaintext form, which is rejected at any other count. */
const B1_PARTS = 33;

const decode = (data: Uint8Array) => new TextDecoder('iso-8859-1').decode(data);

function isHex(value: string): boolean {
	return value.length > 0 && /^[0-9a-fA-F]+$/.test(value);
}

export function isHzpp(data: Uint8Array): boolean {
	if (data.length < 4) return false;
	const s = decode(data);
	if (s.startsWith('B1')) return s.slice(2).split('|').length === B1_PARTS;
	if (s.startsWith('A1')) {
		const body = s.slice(2);
		// whole AES blocks, and long enough to hold a layout plus its IV
		return isHex(body) && body.length % 32 === 0 && body.length >= 64;
	}
	return false;
}

/** Minutes since the epoch as an ISO instant. Zero means the field is unset. */
function minutesSince(minutes: number): string | null {
	if (!Number.isFinite(minutes) || minutes <= 0) return null;
	return new Date((HZPP_EPOCH + minutes * 60) * 1000).toISOString().replace('.000Z', 'Z');
}

const int = (value: string) => {
	const n = parseInt(value, 10);
	if (!Number.isFinite(n)) throw new Error('HŽPP field is not a number');
	return n;
};

/** Blank and all-zero blocks carry nothing, so they are not worth showing. */
const meaningful = (value: string) => (/^[0\s]*$/.test(value) ? null : value.trim());

function train(number: string, reservation: string, seat: string): HzppTrain | null {
	const trainNumber = int(number);
	if (!trainNumber) return null;
	return {
		trainNumber,
		reservationReference: meaningful(reservation),
		seat: meaningful(seat)
	};
}

function segment(
	from: string,
	to: string,
	via: string,
	travelClass: string,
	trainType: string,
	trains: (HzppTrain | null)[]
): HzppSegment | null {
	const origin = int(from);
	const destination = int(to);
	if (!origin && !destination) return null;
	const route = int(via);
	const cls = int(travelClass);
	const type = int(trainType);
	return {
		originStation: origin + UIC_PREFIX,
		destinationStation: destination + UIC_PREFIX,
		routeNumber: route || null,
		travelClass: cls,
		travelClassName: TRAVEL_CLASSES[cls] ?? `Unknown (${cls})`,
		trainType: type,
		trainTypeName: TRAIN_TYPES[type] ?? `Unknown (${type})`,
		trains: trains.filter((t): t is HzppTrain => t !== null)
	};
}

function passenger(count: string, type: string): HzppPassenger | null {
	const n = int(count);
	if (!n) return null;
	const kind = int(type);
	return {
		passengerType: kind,
		passengerTypeName: PASSENGER_TYPES[kind] ?? `Unknown (${kind})`,
		count: n
	};
}

export function parseHzpp(data: Uint8Array): HzppTicket {
	if (!isHzpp(data)) throw new Error('not an HŽPP ticket');
	const s = decode(data);

	if (s.startsWith('A1')) {
		return { encrypted: true, cipherLength: (s.length - 2) / 2 };
	}

	const p = s.slice(2).split('|');
	const validFrom = minutesSince(int(p[13]));
	const validUntil = minutesSince(int(p[14]));
	const issued = validFrom ? Date.parse(validFrom) / 1000 : null;

	return {
		encrypted: false,
		ticketNumber: p[0],
		ticketType: int(p[1]),
		ticketTypeName: TICKET_TYPES[int(p[1])] ?? `Unknown (${int(p[1])})`,
		price: int(p[2]),
		// The kuna gave way to the euro partway through this format's life, and
		// nothing in the record says which a price is in.
		currency: issued !== null && issued >= EURO_SWITCHOVER ? 'EUR' : 'HRK',
		validFrom,
		validUntil,
		extendedValidity: p[19] === '1',
		issuedOnBoard: p[20] === '1',
		passengers: [passenger(p[15], p[16]), passenger(p[17], p[18])].filter(
			(x): x is HzppPassenger => x !== null
		),
		segments: [
			segment(p[3], p[4], p[5], p[6], p[7], [
				train(p[21], p[22], p[23]),
				train(p[24], p[25], p[26])
			]),
			segment(p[8], p[9], p[10], p[11], p[12], [
				train(p[27], p[28], p[29]),
				train(p[30], p[31], p[32])
			])
		].filter((x): x is HzppSegment => x !== null)
	};
}
