/**
 * SNCF e-billet barcodes: a 131 character fixed-width ASCII record with the
 * magic `i0CV`, carried in an Aztec code on TGV INOUI / sncf-connect tickets.
 *
 * Unrelated to the `eRIV`/`eEDV` reservation record in reservation.ts despite
 * both being SNCF: different magic, different length, different field order.
 * This one names the passenger and carries a date of birth, and notably has
 * no coach or seat, which the reservation record does have. All three sample
 * tickets print a coach and place on their face while encoding neither.
 *
 * The layout is a port of zuegli's `main/sncf/data.py` (EUPL-1.2). Its offsets
 * were re-checked against the printed face of the tickets they came from: the
 * dossier, e-billet number, customer reference, both station mnemonics, train,
 * travel date, passenger name, class and tariff code all match what is
 * printed. One of the specimens prints the tariff code in the page margin
 * ("PN00 - KM0512"), which is what tied that field down.
 *
 * Two things stay unverified. The four characters at offset 19 match nothing
 * printed and are exposed as `extraFields`. The return-leg block at the end is
 * blank or zero on every sample seen, so it is read as zuegli reads it but has
 * never been observed populated.
 */

export interface SncfReturnLeg {
	travelClass: string;
	originCode: string;
	destinationCode: string;
	trainNumber: string;
}

export interface SncfETicket {
	/** Booking reference, printed as "Dossier voyage". */
	pnr: string;
	/** Printed as "N° e-billet". */
	ticketNumber: string;
	/** ISO date. Printed nowhere on the ticket, so the meaning follows zuegli. */
	dateOfBirth: string | null;
	/** Printed as "Référence client", leading zeros included. */
	customerReference: string | null;
	surname: string;
	forename: string;
	/** SNCF five character station mnemonic, e.g. FRPLY for Paris Gare de Lyon. */
	originCode: string;
	destinationCode: string;
	/** Leading zeros stripped: the field is five digits, "06601" for train 6601. */
	trainNumber: string;
	/** The record holds a day and month only. There is no year in it. */
	travelDate: { day: number; month: number } | null;
	/** "1" or "2" on the samples seen. */
	travelClass: string;
	/** Four character tariff code, e.g. "PN00". */
	tariffCode: string | null;
	/** Never seen populated; null unless the block carries something. */
	returnLeg: SncfReturnLeg | null;
	/** Blocks whose meaning is not established, blank and all-zero ones dropped. */
	extraFields: string[];
}

/** The record is a fixed 131 characters; zuegli rejects any other length. */
const LENGTH = 131;

const isPrintableAscii = (data: Uint8Array) => data.every((b) => b >= 0x20 && b <= 0x7e);

export function isSncfETicket(data: Uint8Array): boolean {
	if (data.length !== LENGTH) return false;
	if (!isPrintableAscii(data)) return false;
	return new TextDecoder().decode(data).startsWith('i0CV');
}

/** Drop leading zeros but keep a single one, so "000" reads as "0". */
const unpad = (value: string) => value.replace(/^0+(?=\d)/, '');

/** Blank and all-zero blocks carry nothing, so they are not worth showing. */
const meaningful = (value: string) => (/^[0\s]*$/.test(value) ? null : value.trim());

function parseDob(value: string): string | null {
	const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (!m) return null;
	const [, day, month, year] = m;
	const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
	// reject 31/02 and friends rather than letting them roll over
	if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)) return null;
	return `${year}-${month}-${day}`;
}

function parseTravelDate(value: string): { day: number; month: number } | null {
	const m = value.match(/^(\d{2})\/(\d{2})$/);
	if (!m) return null;
	const day = Number(m[1]);
	const month = Number(m[2]);
	if (day < 1 || day > 31 || month < 1 || month > 12) return null;
	return { day, month };
}

export function parseSncfETicket(data: Uint8Array): SncfETicket {
	if (!isSncfETicket(data)) throw new Error('not an SNCF e-billet record');
	const s = new TextDecoder().decode(data);

	const returnBlock = s.slice(115, 131);
	const returnLeg: SncfReturnLeg | null = meaningful(returnBlock)
		? {
				travelClass: s.slice(115, 116),
				originCode: s.slice(116, 121).trim(),
				destinationCode: s.slice(121, 126).trim(),
				trainNumber: unpad(s.slice(126, 131))
			}
		: null;

	return {
		pnr: s.slice(4, 10),
		ticketNumber: s.slice(10, 19),
		dateOfBirth: parseDob(s.slice(23, 33)),
		customerReference: meaningful(s.slice(53, 72)),
		surname: s.slice(72, 91).trim(),
		forename: s.slice(91, 110).trim(),
		originCode: s.slice(33, 38),
		destinationCode: s.slice(38, 43),
		trainNumber: unpad(s.slice(43, 48)),
		travelDate: parseTravelDate(s.slice(48, 53)),
		travelClass: s.slice(110, 111),
		tariffCode: s.slice(111, 115).trim() || null,
		returnLeg,
		extraFields: [s.slice(19, 23)].map(meaningful).filter((v): v is string => v !== null)
	};
}
