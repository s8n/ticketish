// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * SNCF and Eurostar reservation barcodes: a fixed-width ASCII record whose
 * magic is a lowercase "e" followed by a three letter document type.
 *
 *   eRIV…  Eurostar, ticket numbers printed as "IV<number>"
 *   eRIZ…  Eurostar, printed as "IZ<number>"
 *   eEDV…  SNCF card stock, printed as "DV<number>"
 *
 * The last two letters of the magic are the prefix printed next to the ticket
 * number on the ticket face, which is how the three were tied together.
 *
 * The same record turns up as both PDF417 (card stock and home print) and
 * Aztec (newer e-tickets), so the symbology says nothing about the layout.
 * Lengths seen so far are 120, 121 and 165 characters; the 165 character form
 * carries an extra 45 character alphabetic block at the end.
 *
 * Field meanings were established by reading barcodes against the printed
 * face of the same ticket: dossier/PNR, ticket number, both station codes,
 * train, coach, seat, class and tariff code all match what is printed.
 * Four blocks could not be pinned to anything printed and are exposed as
 * `extraFields` rather than guessed at. Notably no travel date has been
 * located anywhere in the record.
 *
 * Stations use SNCF's five character mnemonics (two letter country code plus
 * three letters), e.g. FRPLY for Paris Gare de Lyon, GBSPX for London St
 * Pancras. There is no station table in this repo, so the codes are shown
 * as-is.
 */

export interface SncfReservation {
	/** Three letter document type following the leading "e", e.g. RIV. */
	documentType: string;
	/** Prefix printed before the ticket number, e.g. "IV" in "IV372800750". */
	numberPrefix: string;
	/** Booking reference, printed as "PNR" or "Dossier". */
	pnr: string;
	ticketNumber: string;
	/** SNCF five character station mnemonic. */
	originCode: string;
	destinationCode: string;
	/** Leading zeros stripped: the field is five digits, "09011" for train 9011. */
	trainNumber: string;
	coach: string;
	seat: string;
	/** As printed: "1", "2" or a fare letter such as "H". */
	travelClass: string;
	/** Four character tariff code, e.g. "PR11". */
	tariffCode: string | null;
	/** Two letters printed just ahead of the tariff code; meaning unconfirmed. */
	serviceCode: string | null;
	/** Trailing alphabetic block, only on the 165 character form. */
	authenticator: string | null;
	/** Blocks whose meaning is not established, blank and all-zero ones dropped. */
	extraFields: string[];
}

/** Shortest record that still contains every field through the service code. */
const MIN_LENGTH = 85;

const isPrintableAscii = (data: Uint8Array) => data.every((b) => b >= 0x20 && b <= 0x7e);

export function isSncfReservation(data: Uint8Array): boolean {
	if (data.length < MIN_LENGTH) return false;
	if (!isPrintableAscii(data)) return false;
	const s = new TextDecoder().decode(data);
	return (
		s[0] === 'e' &&
		/^[A-Z]{3}$/.test(s.slice(1, 4)) &&
		/^\d{9}$/.test(s.slice(10, 19)) &&
		// origin and destination mnemonics, then the train number
		/^[A-Z]{10}$/.test(s.slice(49, 59)) &&
		/^\d{5}$/.test(s.slice(59, 64))
	);
}

/** Drop leading zeros but keep a single one, so "000" reads as "0". */
const unpad = (value: string) => value.replace(/^0+(?=\d)/, '');

/** Blank and all-zero blocks carry nothing, so they are not worth showing. */
const meaningful = (value: string) => (/^[0\s]*$/.test(value) ? null : value.trim());

export function parseSncfReservation(data: Uint8Array): SncfReservation {
	if (!isSncfReservation(data)) throw new Error('not an SNCF reservation record');
	const s = new TextDecoder().decode(data);

	return {
		documentType: s.slice(1, 4),
		numberPrefix: s.slice(2, 4),
		pnr: s.slice(4, 10),
		ticketNumber: s.slice(10, 19),
		originCode: s.slice(49, 54),
		destinationCode: s.slice(54, 59),
		trainNumber: unpad(s.slice(59, 64)),
		coach: unpad(s.slice(73, 75)),
		seat: unpad(s.slice(75, 78)),
		travelClass: s.slice(78, 79),
		tariffCode: s.slice(79, 83).trim() || null,
		serviceCode: s.slice(83, 85).trim() || null,
		authenticator: s.slice(85).trim() || null,
		extraFields: [
			s.slice(19, 23),
			s.slice(23, 35),
			s.slice(35, 49),
			// eight characters between the train number and the coach; on
			// Eurostar records this repeats the train, on SNCF ones it does not
			s.slice(65, 73)
		]
			.map(meaningful)
			.filter((v): v is string => v !== null)
	};
}
