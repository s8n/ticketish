// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * IATA Bar Coded Boarding Pass (BCBP), format M: the printable ASCII record
 * in the PDF417, Aztec, DataMatrix or QR code on an airline boarding pass.
 *
 * The structure is in the BCBP Implementation Guide, seventh edition, kept in
 * `standards/` (gitignored, so fetch it from iata.org). The guide describes
 * how the record is built and what each item means, but leaves the field
 * table and the value lists to Resolution 792, which is sold rather than
 * published. So the offsets here come from the guide's arithmetic for items
 * 6, 10 and 17 read against the sample passes, and the layout is checked
 * against passes from seven airlines on four continents.
 *
 * A record is three kinds of field bolted together:
 *
 * - a fixed 23 character head naming the passenger, then 37 fixed characters
 *   per flight leg, which every pass has to carry;
 * - after each leg, a conditional field whose length that leg declares in
 *   item 6. The first leg's holds the items that describe the whole booking
 *   (item 10 counts them), then the ones that describe that leg (item 17),
 *   then whatever the airline wanted to put in item 4. Later legs get the
 *   last two only;
 * - an optional signature after the last leg, introduced by a "^".
 *
 * Every one of those lengths is written in the record, so an issuer that
 * stops early or pads past the end stays readable: the lengths are believed,
 * and anything left over is kept as `trailing` rather than guessed at.
 *
 * What the format leaves out is the year and the time of day. A leg carries
 * only a day of the year, and the issuing date (item 22) carries a day plus
 * the last digit of its year, so both have to be resolved against something.
 * `flightDate` says what that came to and `yearFrom` says what fixed it.
 */
import { isPrintableAscii } from '../bytes.ts';
import { meaningful } from '../format.ts';
import { dayOfYearDate, lastDigitYear, resolveDayOfYear } from '../dates.ts';

/** Format code, leg count, passenger name, electronic ticket indicator. */
const HEAD = 23;
/** The mandatory items every leg repeats, item 7 through item 6. */
const LEG = 37;

/**
 * Cabin, as IATA Resolution 728 designates it. Item 71 is the compartment
 * the passenger travels in rather than the fare they bought, though issuers
 * that print an itinerary receipt tend to put the booking class here instead.
 * Either way the letters mean the same thing.
 */
const CABINS: Record<string, string> = {
	R: 'Supersonic',
	P: 'First (premium)',
	F: 'First',
	A: 'First (discounted)',
	J: 'Business (premium)',
	C: 'Business',
	D: 'Business (discounted)',
	I: 'Business (discounted)',
	Z: 'Business (discounted)',
	W: 'Premium economy',
	S: 'Economy',
	Y: 'Economy',
	B: 'Economy (discounted)',
	H: 'Economy (discounted)',
	K: 'Economy (discounted)',
	L: 'Economy (discounted)',
	M: 'Economy (discounted)',
	N: 'Economy (discounted)',
	Q: 'Economy (discounted)',
	T: 'Economy (discounted)',
	V: 'Economy (discounted)',
	X: 'Economy (discounted)',
	G: 'Economy (discounted)',
	O: 'Economy (discounted)',
	U: 'Economy (discounted)',
	E: 'Economy (discounted)'
};

/** Item 113, which is how far through the airport the passenger has got. */
const PASSENGER_STATUS: Record<string, string> = {
	'0': 'Ticket issued, not checked in',
	'1': 'Checked in',
	'2': 'Baggage checked, passenger not checked in',
	'3': 'Checked in, baggage checked',
	'4': 'Passed security',
	'5': 'Passed the gate reader',
	'6': 'Transit',
	'7': 'Standby',
	'8': 'Boarding pass revalidated',
	'9': 'Original boarding line used at ticket issuance',
	A: 'Up- or downgrade needed at close out'
};

/** Item 15. Who the passenger is, to the extent the airline records it. */
const PASSENGER_DESCRIPTION: Record<string, string> = {
	'0': 'Adult',
	'1': 'Male',
	'2': 'Female',
	'3': 'Child',
	'4': 'Infant',
	'5': 'No passenger (cabin baggage)',
	'6': 'Adult travelling with an infant',
	'7': 'Unaccompanied minor'
};

/** Items 12 and 14: where the passenger checked in, and where the pass came out. */
const SOURCE: Record<string, string> = {
	W: 'Web',
	K: 'Airport kiosk',
	R: 'Remote kiosk',
	M: 'Mobile device',
	O: 'Airport agent',
	T: 'Town agent',
	V: 'Third party vendor'
};

/** Item 16. The guide's own section on itinerary receipts is where "I" is. */
const DOCUMENT_TYPES: Record<string, string> = {
	B: 'Boarding pass',
	I: 'Itinerary receipt'
};

/** Item 23 and its two non-consecutive counterparts, as item 23's note lays them out. */
export interface BcbpBagTag {
	/** "0" interline, "1" fall-back, "2" interline rush. */
	leadingDigit: string;
	/** The bag tag's carrier, by IATA numeric code. */
	carrierNumericCode: string;
	/** First tag in the series, without the carrier code in front of it. */
	initialTagNumber: string;
	/** How many consecutive tags the series holds, 1 upwards. */
	count: number;
	/** The thirteen characters as issued. */
	raw: string;
}

export interface BcbpLeg {
	/** Item 7, the booking reference with the operating carrier. */
	pnr: string;
	fromAirport: string;
	toAirport: string;
	/** Item 42, the IATA designator of the airline that flies the leg. */
	operatingCarrier: string;
	/** Item 43, without the leading zeros the record pads it with. */
	flightNumber: string | null;
	/** Item 46, day of the year. 1 January is day 1; the year is not in the record. */
	dayOfFlight: number | null;
	/** The day resolved to a calendar date, or null when it could not be. */
	flightDate: string | null;
	/** Item 71, the cabin code. */
	compartment: string | null;
	compartmentLabel: string | null;
	/** Item 104, with the leading zeros of the row number dropped. */
	seat: string | null;
	/** Item 107, the check-in sequence number. */
	sequence: string | null;
	passengerStatus: string | null;
	passengerStatusLabel: string | null;
	/** Item 142, the operating carrier's IATA numeric (accounting) code. */
	airlineNumericCode: string | null;
	/** Item 143, the last ten digits of the electronic ticket number. */
	documentSerial: string | null;
	/**
	 * Item 18. The guide says United States travel requires this and that the
	 * values are the vetting statuses TSA maintains, without naming them, so
	 * the code is shown as issued.
	 */
	selectee: string | null;
	/** Item 108, whether the passenger's travel documents need checking. */
	documentVerification: string | null;
	/** Item 19, the airline whose flight number the ticket was sold under. */
	marketingCarrier: string | null;
	frequentFlyerAirline: string | null;
	frequentFlyerNumber: string | null;
	/** Item 89, the industry discount category. Values are not in the guide. */
	idAdIndicator: string | null;
	/** Item 118, e.g. "20K" or "2PC". */
	freeBaggageAllowance: string | null;
	/** Item 254, whether the passenger may use the priority security lane. */
	fastTrack: boolean | null;
	/** Item 4, which the standard leaves entirely to the airline. */
	airlineUse: string | null;
}

export interface BcbpSecurity {
	/** Item 28, which says which algorithm signed the record. */
	type: string | null;
	/** Item 30, the signature itself, as issued. */
	data: string;
}

export interface BcbpTicket {
	/** Item 9, the version of Resolution 792 the record was written to. */
	version: number | null;
	/** Item 5, however many legs the record claims. */
	legCount: number;
	/** Item 11, as issued: surname, then "/", then given name and any title. */
	passengerName: string;
	surname: string;
	givenName: string | null;
	/**
	 * Item 253. True for an electronic ticket, false for a ticketless product,
	 * null where the issuer left the field blank. Vueling does, and shifts its
	 * booking reference into the blank rather than padding it on the right.
	 */
	electronicTicket: boolean | null;
	legs: BcbpLeg[];
	passengerDescription: string | null;
	passengerDescriptionLabel: string | null;
	sourceOfCheckIn: string | null;
	sourceOfCheckInLabel: string | null;
	sourceOfIssuance: string | null;
	sourceOfIssuanceLabel: string | null;
	/** Item 22, resolved the same way a flight date is. */
	issueDate: string | null;
	documentType: string | null;
	documentTypeLabel: string | null;
	/** Item 21, the airline that issued the pass, which need not be the carrier. */
	issuerDesignator: string | null;
	/** Items 23, 31 and 32, in that order, skipping the ones left blank. */
	bagTags: BcbpBagTag[];
	security: BcbpSecurity | null;
	/**
	 * What the year in `flightDate` was worked out from, since no year is in
	 * the record. "issue" means the issuing date fixed it, which it does
	 * whenever item 22 is filled in; "today" means nothing in the record could
	 * and the occurrence nearest now was taken.
	 */
	yearFrom: 'issue' | 'today';
	/**
	 * Whatever followed the last field the record accounted for. Pegasus pads
	 * its passes past the end, and nothing in the standard says what with.
	 */
	trailing: string | null;
}

/** Two ASCII hex digits, which is how the record writes its own lengths. */
function fieldSize(value: string): number | null {
	if (/^\s*$/.test(value)) return 0; // an issuer that leaves it blank means none
	if (!/^[0-9A-Fa-f]{2}$/.test(value)) return null;
	return parseInt(value, 16);
}

/** A day of the year, or null where the field is blank or not a day. */
function dayOfYear(value: string): number | null {
	if (!/^\d{3}$/.test(value)) return null;
	const day = Number(value);
	return day >= 1 && day <= 366 ? day : null;
}

/**
 * Item 22: the last digit of a year, then the day of it. Only the digit is
 * there, so the decade is assumed the way `lastDigitYear` explains.
 */
function issuingDate(value: string, now: Date): { year: number; day: number } | null {
	if (!/^\d{4}$/.test(value)) return null;
	const day = dayOfYear(value.slice(1));
	const year = lastDigitYear(Number(value[0]), now);
	return day !== null && year !== null ? { year, day } : null;
}

/**
 * The calendar date a leg's day of the year stands for.
 *
 * A pass is issued before the flight, so the issuing date fixes the year: the
 * same one when the flight falls later in it, the next one when it falls
 * earlier. Without an issuing date there is nothing in the record to count
 * from, and the nearest occurrence to today is the best that can be done.
 */
function flightDate(day: number, issued: { year: number; day: number } | null, now: Date): string | null {
	if (!issued) return resolveDayOfYear(day, now);
	return dayOfYearDate(day >= issued.day ? issued.year : issued.year + 1, day);
}

/** Leading zeros are padding here, not part of the number. */
const unpad = (value: string) => meaningful(value)?.replace(/^0+(?=.)/, '') ?? null;

/** A one character code, or null where the issuer left it blank. */
const code = (value: string) => (value.trim() === '' ? null : value.trim());

const label = (map: Record<string, string>, value: string | null) =>
	value === null ? null : (map[value] ?? null);

function bagTag(raw: string): BcbpBagTag | null {
	if (!/^\d{13}$/.test(raw) || meaningful(raw) === null) return null;
	return {
		leadingDigit: raw[0],
		carrierNumericCode: raw.slice(1, 4),
		initialTagNumber: raw.slice(4, 10),
		count: Number(raw.slice(10, 13)),
		raw
	};
}

/**
 * A record reader that never runs off the end. An issuer that stopped writing
 * short of a length it declared leaves blanks behind rather than an error,
 * which is what a scanner at a gate does with the same pass.
 */
class Reader {
	constructor(
		private readonly s: string,
		public at = 0
	) {}

	/** The next n characters, blank filled where the record stopped short. */
	take(n: number): string {
		const value = this.s.slice(this.at, this.at + n);
		this.at += n;
		return value.padEnd(n, ' ');
	}

	/** The same, but never past a length some outer field already declared. */
	bounded(n: number, limit: number): string {
		return this.take(Math.max(0, Math.min(n, limit - this.at)));
	}

	get rest(): string {
		return this.s.slice(this.at);
	}
}

export function isBcbp(data: Uint8Array): boolean {
	if (data.length < HEAD + LEG) return false;
	if (!isPrintableAscii(data)) return false;
	const s = new TextDecoder().decode(data);
	if (s[0] !== 'M' || !/^[1-9]$/.test(s[1])) return false;

	// The first leg is what settles it: three letter airport codes on either
	// side of a designator, a day that is a day, and a length written in hex.
	const leg = s.slice(HEAD, HEAD + LEG);
	return (
		/^[A-Z]{3}$/.test(leg.slice(7, 10)) &&
		/^[A-Z]{3}$/.test(leg.slice(10, 13)) &&
		/^[A-Z0-9]{2}[A-Z0-9 ]$/.test(leg.slice(13, 16)) &&
		dayOfYear(leg.slice(21, 24)) !== null &&
		fieldSize(leg.slice(35, 37)) !== null
	);
}

export function parseBcbp(data: Uint8Array, now: Date = new Date()): BcbpTicket {
	if (!isBcbp(data)) throw new Error('not a BCBP record');
	const s = new TextDecoder().decode(data);
	const r = new Reader(s);

	r.take(1); // item 1, the format code, which isBcbp has already checked
	const legCount = Number(r.take(1));
	const passengerName = r.take(20).trim();
	const indicator = code(r.take(1));

	let version: number | null = null;
	let issued: { year: number; day: number } | null = null;
	let issueDate: string | null = null;
	let passengerDescription: string | null = null;
	let sourceOfCheckIn: string | null = null;
	let sourceOfIssuance: string | null = null;
	let documentType: string | null = null;
	let issuerDesignator: string | null = null;
	const bagTags: BcbpBagTag[] = [];
	const legs: BcbpLeg[] = [];

	for (let i = 0; i < legCount && r.at < s.length; i++) {
		const pnr = r.take(7).trim();
		const fromAirport = r.take(3);
		const toAirport = r.take(3);
		const operatingCarrier = r.take(3).trim();
		const flightNumber = unpad(r.take(5));
		const day = dayOfYear(r.take(3));
		const compartment = code(r.take(1));
		const seat = unpad(r.take(4));
		const sequence = unpad(r.take(5));
		const passengerStatus = code(r.take(1));

		// Item 6 is how much of what follows belongs to this leg. Nothing past
		// it is read, so a leg that declares none is followed straight by the
		// next one and an issuer that pads the symbol does not shift anything.
		const declared = fieldSize(r.take(2)) ?? 0;
		const conditionalEnd = Math.min(r.at + declared, s.length);

		// The items describing the whole booking ride along with the first leg,
		// behind a ">" and the version of the standard they were written to.
		if (i === 0 && r.at < conditionalEnd && s[r.at] === '>') {
			r.take(1);
			const digit = r.take(1);
			version = /^\d$/.test(digit) ? Number(digit) : null;
			const uniqueSize = fieldSize(r.take(2)) ?? 0;
			const unique = new Reader(r.bounded(uniqueSize, conditionalEnd));
			passengerDescription = code(unique.take(1));
			sourceOfCheckIn = code(unique.take(1));
			sourceOfIssuance = code(unique.take(1));
			issued = issuingDate(unique.take(4), now);
			issueDate = issued ? dayOfYearDate(issued.year, issued.day) : null;
			documentType = code(unique.take(1));
			issuerDesignator = code(unique.take(3));
			for (const tag of [unique.take(13), unique.take(13), unique.take(13)]) {
				const parsed = bagTag(tag);
				if (parsed) bagTags.push(parsed);
			}
		}

		// Then the items describing this leg, counted by item 17.
		let repeated = new Reader('');
		if (r.at < conditionalEnd) {
			const repeatedSize = fieldSize(r.take(2)) ?? 0;
			repeated = new Reader(r.bounded(repeatedSize, conditionalEnd));
		}
		const airlineNumericCode = meaningful(repeated.take(3));
		const documentSerial = meaningful(repeated.take(10));
		const selectee = code(repeated.take(1));
		const documentVerification = code(repeated.take(1));
		const marketingCarrier = code(repeated.take(3));
		const frequentFlyerAirline = code(repeated.take(3));
		const frequentFlyerNumber = meaningful(repeated.take(16));
		const idAdIndicator = code(repeated.take(1));
		const freeBaggageAllowance = meaningful(repeated.take(3));
		const fast = code(repeated.take(1));

		// Item 4 is the rest of what the leg declared, and is the airline's own.
		const airlineUse = meaningful(s.slice(r.at, conditionalEnd));
		r.at = Math.max(r.at, conditionalEnd);

		legs.push({
			pnr,
			fromAirport,
			toAirport,
			operatingCarrier,
			flightNumber,
			dayOfFlight: day,
			flightDate: day === null ? null : flightDate(day, issued, now),
			compartment,
			compartmentLabel: label(CABINS, compartment),
			seat,
			sequence,
			passengerStatus,
			passengerStatusLabel: label(PASSENGER_STATUS, passengerStatus),
			airlineNumericCode,
			documentSerial,
			selectee,
			documentVerification,
			marketingCarrier,
			frequentFlyerAirline,
			frequentFlyerNumber,
			idAdIndicator,
			freeBaggageAllowance,
			fastTrack: fast === null ? null : fast === 'Y',
			airlineUse
		});
	}

	// A signature, where the local security administration asks for one. What
	// it covers is the record in front of it, which reads the same either way.
	let security: BcbpSecurity | null = null;
	if (s[r.at] === '^') {
		r.take(1);
		const type = code(r.take(1));
		const length = fieldSize(r.take(2));
		if (length !== null) security = { type, data: r.take(length).trim() };
	}

	const [surname, givenName] = passengerName.split('/');
	return {
		version,
		legCount,
		passengerName,
		surname: surname ?? passengerName,
		givenName: givenName?.trim() || null,
		electronicTicket: indicator === null ? null : indicator === 'E',
		legs,
		passengerDescription,
		passengerDescriptionLabel: label(PASSENGER_DESCRIPTION, passengerDescription),
		sourceOfCheckIn,
		sourceOfCheckInLabel: label(SOURCE, sourceOfCheckIn),
		sourceOfIssuance,
		sourceOfIssuanceLabel: label(SOURCE, sourceOfIssuance),
		issueDate,
		documentType,
		documentTypeLabel: label(DOCUMENT_TYPES, documentType),
		issuerDesignator,
		bagTags,
		security,
		yearFrom: issued ? 'issue' : 'today',
		trailing: meaningful(r.rest)
	};
}
