// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * ELB, the Element List Barcode, specified in ERA TAP TSI technical document
 * B.12 section 8 (ERA-REC-122/TD/02 v2.0).
 *
 * A fixed-width ASCII record of 85 characters for a one segment trip and 121
 * for a two segment one, every element drawn from A-Z and 0-9. It was defined
 * by SNCF for ATB printers that could not manage a real 2D symbol, which is
 * why B.12 describes it as PDF417 only, "not a real 2D barcode, but a stack
 * of 1D-barcodes". In practice it also turns up in Aztec on newer e-tickets,
 * so the symbology says nothing about the layout.
 *
 * The record is not SNCF only. Its first three characters are the ID format
 * and the pectab code, then a two character ticket code which is the prefix
 * printed next to the ticket number:
 *
 *   eRIV…  Eurostar, ticket numbers printed as "IV<number>"
 *   eRIZ…  Eurostar, printed as "IZ<number>"
 *   eEDV…  SNCF card stock, printed as "DV<number>"
 *
 * B.12 states ELB has no seal, and recommends against it for new work. Some
 * issuers add one anyway: records of 165 characters carry a one segment trip
 * followed by an 80 character alphabetic block, which also puts them past the
 * 144 byte maximum the specification gives. That block is kept as `seal`
 * without any claim about what it covers.
 *
 * Offsets here were first established by reading barcodes against the printed
 * face of the same ticket, and later checked against B.12's element table,
 * which agreed and named the fields the earlier work could not place: the
 * specimen flag, the barcode version and ticket sequence, the passenger
 * counts, and the dates.
 */
import { isPrintableAscii } from '../bytes.ts';
import { dayOfYearDate, lastDigitYear } from '../dates.ts';
import { meaningful } from '../format.ts';

export interface ElbSegment {
	/** Five character station mnemonic, the same space SNCF e-billets use. */
	departureStation: string;
	arrivalStation: string;
	/** Leading zeros stripped: the field is five digits plus a blank. */
	trainNumber: string;
	/** Per-train anti-fraud code. Repeats the train number on some issuers. */
	securityCode: string | null;
	/** Day of the year, 1 January = 1. */
	departureDay: number | null;
	/** The above resolved against the year, which the record only half gives. */
	departureDate: string | null;
	coach: string;
	seat: string;
	/** "1" or "2", or a fare letter such as "H". */
	travelClass: string;
	/** Four blanks means a full fare ticket. */
	tariffCode: string | null;
	/** Extra services or conditions, e.g. non-exchangeable. */
	classOfService: string | null;
}

export interface ElbTicket {
	/** Pectab code: "R" on the Eurostar records, "E" on the SNCF card stock. */
	pectab: string;
	/** Two characters, printed before the ticket number, e.g. "IV". */
	ticketCode: string;
	/** Booking reference, printed as "PNR" or "Dossier". */
	pnr: string;
	/** The TCN, printed as the ticket number. */
	ticketNumber: string;
	/** B.12 calls 1 a real ticket and 0 a specimen. */
	specimen: boolean;
	/** Which element layout the record uses, for readers that care. */
	barcodeVersion: string;
	/** Ticket x of y, from the two digit sequence field. */
	ticketInSequence: number | null;
	ticketsInSequence: number | null;
	/** Frequent traveller and similar. Blank on every sample seen. */
	travelerType: string | null;
	numAdults: number | null;
	numChildren: number | null;
	/** The year's last digit, which is all the record carries of it. */
	yearDigit: string;
	/** The decade assumed for that digit; null when the digit is not one. */
	year: number | null;
	/** Date of issue, from the emission day of the year. */
	issuedDate: string | null;
	validFrom: string | null;
	validUntil: string | null;
	/** One entry for a single leg, two for an out and back. */
	segments: ElbSegment[];
	/** Issuer added block past the end of the specified record. */
	seal: string | null;
	/** Ten characters B.12 reserves for future use. */
	nonUsedDigits: string | null;
}

/** Everything ahead of the first segment. */
const HEADER_SIZE = 49;
/** One trip segment, so 85 is the shortest complete record. */
const SEGMENT_SIZE = 36;
const MIN_LENGTH = HEADER_SIZE + SEGMENT_SIZE;
const TWO_SEGMENTS = HEADER_SIZE + 2 * SEGMENT_SIZE;

export function isElb(data: Uint8Array): boolean {
	if (data.length < MIN_LENGTH) return false;
	if (!isPrintableAscii(data)) return false;
	const s = new TextDecoder().decode(data);
	return (
		s[0] === 'e' &&
		// pectab plus the two character ticket code
		/^[A-Z]{3}$/.test(s.slice(1, 4)) &&
		/^\d{9}$/.test(s.slice(10, 19)) &&
		// the first segment's two station mnemonics, then its train number
		/^[A-Z]{10}$/.test(s.slice(49, 59)) &&
		/^\d{5}$/.test(s.slice(59, 64))
	);
}

/** Drop leading zeros but keep a single one, so "000" reads as "0". */
const unpad = (value: string) => value.replace(/^0+(?=\d)/, '');

function count(value: string): number | null {
	return /^\d+$/.test(value) ? parseInt(value, 10) : null;
}

/** Day of the year as B.12 writes it, "1/1=1, 2/1=2", or null if unusable. */
function day(value: string): number | null {
	const n = count(value);
	return n !== null && n >= 1 && n <= 366 ? n : null;
}

/**
 * A segment is present when it is not blank and its train number field holds
 * a train, which is what tells a real second leg apart from the seal that
 * some issuers write into the same space.
 */
function hasSegment(s: string, at: number): boolean {
	const block = s.slice(at, at + SEGMENT_SIZE);
	if (block.length < SEGMENT_SIZE || !block.trim()) return false;
	return /^\d{5}/.test(block.slice(10, 16));
}

function parseSegment(s: string, at: number, year: number | null): ElbSegment {
	const departureDay = day(s.slice(at + 20, at + 23));
	return {
		departureStation: s.slice(at, at + 5),
		arrivalStation: s.slice(at + 5, at + 10),
		trainNumber: unpad(s.slice(at + 10, at + 16).trim()),
		securityCode: meaningful(s.slice(at + 16, at + 20)),
		departureDay,
		departureDate: year !== null && departureDay !== null ? dayOfYearDate(year, departureDay) : null,
		coach: unpad(s.slice(at + 23, at + 26)),
		seat: unpad(s.slice(at + 26, at + 29)),
		travelClass: s.slice(at + 29, at + 30),
		tariffCode: s.slice(at + 30, at + 34).trim() || null,
		classOfService: s.slice(at + 34, at + 36).trim() || null
	};
}

export function parseElb(data: Uint8Array, now?: Date): ElbTicket {
	if (!isElb(data)) throw new Error('not an ELB record');
	const s = new TextDecoder().decode(data);

	const yearDigit = s.slice(39, 40);
	const year = /^\d$/.test(yearDigit) ? lastDigitYear(Number(yearDigit), now) : null;

	const emissionDay = day(s.slice(40, 43));
	const beginDay = day(s.slice(43, 46));
	const endDay = day(s.slice(46, 49));
	// End validity is a day of the year like the others, so a value below the
	// start belongs to the year after it rather than being nonsense.
	const endYear = year !== null && beginDay !== null && endDay !== null && endDay < beginDay
		? year + 1
		: year;

	const segments: ElbSegment[] = [parseSegment(s, HEADER_SIZE, year)];
	if (hasSegment(s, HEADER_SIZE + SEGMENT_SIZE)) {
		segments.push(parseSegment(s, HEADER_SIZE + SEGMENT_SIZE, year));
	}

	// Whatever follows the segments the record actually carries.
	const sealFrom = segments.length === 2 ? TWO_SEGMENTS : MIN_LENGTH;
	const sequence = s.slice(21, 23);

	return {
		pectab: s.slice(1, 2),
		ticketCode: s.slice(2, 4),
		pnr: s.slice(4, 10),
		ticketNumber: s.slice(10, 19),
		specimen: s.slice(19, 20) === '0',
		barcodeVersion: s.slice(20, 21),
		ticketInSequence: count(sequence.slice(0, 1)),
		ticketsInSequence: count(sequence.slice(1, 2)),
		travelerType: meaningful(s.slice(33, 35)),
		numAdults: count(s.slice(35, 37)),
		numChildren: count(s.slice(37, 39)),
		yearDigit,
		year,
		issuedDate: year !== null && emissionDay !== null ? dayOfYearDate(year, emissionDay) : null,
		validFrom: year !== null && beginDay !== null ? dayOfYearDate(year, beginDay) : null,
		validUntil: endYear !== null && endDay !== null ? dayOfYearDate(endYear, endDay) : null,
		segments,
		seal: s.slice(sealFrom).trim() || null,
		nonUsedDigits: meaningful(s.slice(23, 33))
	};
}
