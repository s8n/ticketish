/**
 * SSB barcodes (the older bit-packed UIC format still used for e.g. NS
 * Keycards). 114+ bytes: a bit-packed header and body, with the trailing 56
 * bytes carrying the signature.
 *
 * Layouts ported from zuegli's main/ssb (EUPL-1.2).
 */

export interface SsbEnvelope {
	version: number;
	issuerRics: number;
	keyId: number;
	ticketType: number;
	ticketTypeName: string;
	data: SsbRecord | null;
	/** Set when the ticket type has no dedicated parser yet. */
	unsupported?: string;
	bodyHex: string;
}

export type SsbRecord =
	| SsbKeycard
	| SsbNonReservationTicket
	| SsbReservationTicket
	| SsbGroupTicket
	| SsbPass;

/** A station reference, which may be a code or a printed name. */
export interface SsbStation {
	value: string;
	/** uic = UIC station code, name = printed name, other = issuer-specific code */
	type: 'uic' | 'name' | 'other' | 'benerail';
}

interface SsbCommon {
	specimen: boolean;
	numAdults: number;
	numChildren: number;
	travelClass: number;
	pnr: string;
	issuingDate: string;
	extraText: string;
	informationMessage: number;
}

export interface SsbNonReservationTicket extends SsbCommon {
	kind: 'non-reservation';
	returnIncluded: boolean;
	validityStart: string;
	validityEnd: string;
	departureStation: SsbStation;
	arrivalStation: SsbStation;
}

export interface SsbReservationTicket extends SsbCommon {
	kind: 'reservation';
	subType: number;
	departure: string;
	departureStation: SsbStation;
	arrivalStation: SsbStation;
	trainNumber: string;
	coachNumber: number;
	seatNumber: string;
	overbooked: boolean;
}

export interface SsbGroupTicket extends SsbCommon {
	kind: 'group';
	returnIncluded: boolean;
	validityStart: string;
	validityEnd: string;
	departureStation: SsbStation;
	arrivalStation: SsbStation;
	groupLeader: string;
	countermark: number;
}

export interface SsbPass extends SsbCommon {
	kind: 'pass';
	subType: number;
	validityStart: string;
	validityEnd: string;
	travelDays: number;
	countries: number[];
	twoPages: boolean;
}

export interface SsbKeycard {
	kind: 'ns-keycard';
	version: number;
	cardId: string;
	numAdults: number;
	numChildren: number;
	specimen: boolean;
	travelClass: number;
	extraText: string;
	stationUic: number;
	issuingDate: string;
	validityStart: string;
	validityEnd: string;
	numTravelDays: number;
	productCode: number;
	productName: string;
}

class Bits {
	constructor(private d: Uint8Array) {}
	bit(i: number): number {
		return (this.d[i >> 3] >> (7 - (i & 7))) & 1;
	}
	bool(i: number): boolean {
		return this.bit(i) === 1;
	}
	int(start: number, end: number): number {
		let v = 0;
		for (let i = start; i < end; i++) v = v * 2 + this.bit(i);
		return v;
	}
	/** 6-bit characters offset by 0x20 */
	str(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += String.fromCharCode(this.int(i, i + 6) + 0x20);
		return s.trim();
	}
	slice(start: number): Bits {
		// re-pack from a bit offset
		const bitLen = this.d.length * 8 - start;
		const out = new Uint8Array(Math.ceil(bitLen / 8));
		for (let i = 0; i < bitLen; i++) {
			if (this.bit(start + i)) out[i >> 3] |= 0x80 >> (i & 7);
		}
		return new Bits(out);
	}
	get bytes(): Uint8Array {
		return this.d;
	}
}

const NS_PRODUCTS: Record<number, string> = {
	1: 'Keycard',
	2: 'Jaarpas passage',
	3: 'Kwartaalpas passage',
	4: 'Dagpas',
	5: 'Dagpas groep',
	6: 'Preprinted ATB',
	7: 'Uitstel van Betaling',
	8: 'Meereiskaart Spoordeelweken',
	9: 'Landencoupon',
	12: 'Thalys Employee Pass',
	14: 'Eurail Pass Cover',
	15: 'Interrail Pass Cover',
	16: 'Boekenweekgeschenk',
	17: 'Dagpas Speciaal',
	18: 'Keycard Speciaal',
	19: 'Weekend passage',
	20: 'Charter Dagpas RPR',
	21: 'NMBS Trainkaarten',
	25: 'Exit recht',
	26: 'Evenement',
	27: 'Maandpas passage',
	28: 'Halfjaarpas passage',
	29: 'Dagpas groep (dynamisch)',
	30: 'Weekpas',
	33: 'Dagpas avond'
};

const TICKET_TYPE_NAMES: Record<number, string> = {
	1: 'Integrated reservation ticket',
	2: 'Non-reservation ticket',
	3: 'Group ticket',
	4: 'Pass',
	21: 'NS Keycard'
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * SSB stores only the last digit of the year; resolve it to the most recent
 * matching year that is not in the future.
 */
function resolveYear(digit: number, now: Date): number {
	let year = Math.floor(now.getUTCFullYear() / 10) * 10 + digit;
	if (Date.UTC(year, 0, 1) > now.getTime()) year -= 10;
	return year;
}

function parseKeycard(d: Bits, now: Date): SsbKeycard {
	const year = resolveYear(d.int(105, 109), now);
	const issuingDay = d.int(109, 118);
	const issuing = new Date(Date.UTC(year, 0, 1));
	issuing.setUTCDate(issuing.getUTCDate() + issuingDay - 1);

	const validityStart = new Date(issuing);
	validityStart.setUTCDate(validityStart.getUTCDate() + d.int(129, 138));
	const validityEnd = new Date(issuing);
	validityEnd.setUTCDate(validityEnd.getUTCDate() + d.int(138, 150));

	const stationId = d.int(367, 384);
	const productCode = d.int(118, 125);

	return {
		kind: 'ns-keycard',
		version: d.int(125, 129),
		cardId: d.str(21, 105),
		numAdults: d.int(0, 7),
		numChildren: d.int(7, 14),
		// the flag is inverted here compared to other SSB ticket types
		specimen: !d.bool(14),
		travelClass: d.int(15, 21),
		extraText: d.str(157, 367),
		stationUic: stationId ? 8400000 + stationId : 0,
		issuingDate: isoDate(issuing),
		validityStart: isoDate(validityStart),
		validityEnd: isoDate(validityEnd),
		numTravelDays: d.int(150, 157),
		productCode,
		productName: NS_PRODUCTS[productCode] ?? `Product ${productCode}`
	};
}

/**
 * Station pair layout shared by the non-reservation, group and reservation
 * records; the field offsets differ per record so they are passed in.
 */
function stations(
	d: Bits,
	issuerRics: number,
	flagBit: number,
	start: number
): { from: SsbStation; to: SsbStation; codeTable: number | null } {
	const mid = start + 30;
	const end = start + 60;
	if (issuerRics === 3018) {
		return {
			from: { value: d.str(start, mid), type: 'benerail' },
			to: { value: d.str(mid, end), type: 'benerail' },
			codeTable: null
		};
	}
	if (!d.bool(flagBit)) {
		const codeTable = d.int(start, start + 4);
		const numStart = start + 4;
		const numMid = numStart + 28;
		const type = codeTable === 1 ? 'uic' : 'other';
		return {
			from: { value: String(d.int(numStart, numMid)), type },
			to: { value: String(d.int(numMid, numMid + 28)), type },
			codeTable
		};
	}
	if (issuerRics === 1080 || issuerRics === 1088) {
		return {
			from: { value: String(d.int(start, mid) % 10000000), type: 'uic' },
			to: { value: String(d.int(mid, end) % 10000000), type: 'uic' },
			codeTable: null
		};
	}
	return {
		from: { value: d.str(start, mid), type: 'name' },
		to: { value: d.str(mid, end), type: 'name' },
		codeTable: null
	};
}

/** Fields shared by all standard SSB ticket records. */
function common(d: Bits, issuingDate: Date, extraText: string, informationMessage: number): SsbCommon {
	return {
		specimen: d.bool(14),
		numAdults: d.int(0, 7),
		numChildren: d.int(7, 14),
		travelClass: d.int(15, 21),
		pnr: d.str(21, 105),
		issuingDate: isoDate(issuingDate),
		extraText,
		informationMessage
	};
}

function issuingDateOf(d: Bits, now: Date): Date {
	const year = resolveYear(d.int(105, 109), now);
	const date = new Date(Date.UTC(year, 0, 1));
	date.setUTCDate(date.getUTCDate() + d.int(109, 118) - 1);
	return date;
}

function plusDays(base: Date, days: number): Date {
	const out = new Date(base);
	out.setUTCDate(out.getUTCDate() + days);
	return out;
}

function parseNonReservation(d: Bits, issuerRics: number, now: Date): SsbNonReservationTicket {
	const issuing = issuingDateOf(d, now);
	const st = stations(d, issuerRics, 137, 138);
	return {
		kind: 'non-reservation',
		...common(d, issuing, d.str(212, 434), d.int(198, 212)),
		returnIncluded: d.bool(118),
		validityStart: isoDate(plusDays(issuing, d.int(119, 128))),
		validityEnd: isoDate(plusDays(issuing, d.int(128, 137))),
		departureStation: st.from,
		arrivalStation: st.to
	};
}

function parseReservation(d: Bits, issuerRics: number, now: Date): SsbReservationTicket {
	const issuing = issuingDateOf(d, now);
	const st = stations(d, issuerRics, 120, 121);
	const departureDate = plusDays(issuing, d.int(181, 190));
	const minutes = d.int(190, 201);
	const p = (n: number) => String(n).padStart(2, '0');
	return {
		kind: 'reservation',
		...common(d, issuing, d.str(274, 436), d.int(260, 274)),
		subType: d.int(118, 120),
		departure: `${isoDate(departureDate)}T${p(Math.floor(minutes / 60) % 24)}:${p(minutes % 60)}`,
		departureStation: st.from,
		arrivalStation: st.to,
		trainNumber: d.str(201, 231),
		coachNumber: d.int(231, 241),
		seatNumber: d.str(241, 259),
		overbooked: d.bool(259)
	};
}

function parseGroup(d: Bits, issuerRics: number, now: Date): SsbGroupTicket {
	const issuing = issuingDateOf(d, now);
	const st = stations(d, issuerRics, 137, 138);
	return {
		kind: 'group',
		...common(d, issuing, d.str(292, 436), d.int(278, 292)),
		returnIncluded: d.bool(118),
		validityStart: isoDate(plusDays(issuing, d.int(119, 128))),
		validityEnd: isoDate(plusDays(issuing, d.int(128, 137))),
		departureStation: st.from,
		arrivalStation: st.to,
		groupLeader: d.str(198, 270),
		countermark: d.int(270, 278)
	};
}

function parsePass(d: Bits, now: Date): SsbPass {
	const issuing = issuingDateOf(d, now);
	const countries: number[] = [d.int(145, 152)];
	for (const start of [152, 159, 166, 173]) {
		const c = d.int(start, start + 7);
		if (c) countries.push(c);
	}
	return {
		kind: 'pass',
		...common(d, issuing, d.str(195, 435), d.int(181, 195)),
		subType: d.int(118, 120),
		validityStart: isoDate(plusDays(issuing, d.int(120, 129))),
		validityEnd: isoDate(plusDays(issuing, d.int(129, 138))),
		travelDays: d.int(138, 145),
		countries,
		twoPages: d.bool(180)
	};
}

export function isSsb(data: Uint8Array): boolean {
	if (data.length < 114) return false;
	const version = (data[0] >> 4) & 0x0f;
	return version === 2 || version === 3;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export function parseSsb(data: Uint8Array, now: Date = new Date()): SsbEnvelope {
	if (!isSsb(data)) throw new Error('not an SSB barcode');
	const signatureOffset = data.length - 56;
	const d = new Bits(data.subarray(0, signatureOffset));

	const version = d.int(0, 4);
	const issuerRics = d.int(4, 18);
	const keyId = d.int(18, 22);
	const ticketType = d.int(22, 27);
	const body = d.slice(27);

	const envelope: SsbEnvelope = {
		version,
		issuerRics,
		keyId,
		ticketType,
		ticketTypeName: TICKET_TYPE_NAMES[ticketType] ?? `Type ${ticketType}`,
		data: null,
		bodyHex: hex(body.bytes)
	};

	// NS (RICS 1184) and DB (1080) use ticket type 21 for Keycards.
	if (ticketType === 21 && (issuerRics === 1184 || issuerRics === 1080)) {
		envelope.data = parseKeycard(body, now);
	} else if (ticketType === 1) {
		envelope.data = parseReservation(body, issuerRics, now);
	} else if (ticketType === 2) {
		envelope.data = parseNonReservation(body, issuerRics, now);
	} else if (ticketType === 3) {
		envelope.data = parseGroup(body, issuerRics, now);
	} else if (ticketType === 4) {
		envelope.data = parsePass(body, now);
	} else {
		envelope.unsupported = `SSB ticket type ${ticketType} is not decoded yet`;
	}

	return envelope;
}
