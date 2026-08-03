// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Trenitalia barcodes.
 *
 * A 67-byte bit-packed payload that opens with an SSB-style header (version,
 * RICS 83, key id, ticket type 16) but whose body follows no published
 * specification. The offsets below were established by diffing four real
 * barcodes against their printed tickets, covering both reserved and
 * unreserved fares, so every field is confirmed by tickets that disagree on
 * its value.
 *
 * Note the seat: the number is a 6-bit integer and the coach letter a 6-bit
 * character from the same alphabet, so seat 21D stores 21 rather than the
 * digits "2" and "1".
 *
 * Departure time and station codes are deliberately absent: several
 * encodings were tried against all three tickets and none matched, which
 * fits a barcode that identifies a booking rather than describing it.
 */
import { Bits } from '../bits.ts';
import { resolveDayOfYear } from '../dates.ts';

/** 6-bit alphanumeric, zero-padded to the field width. */
function str(d: Bits, start: number, chars: number): string {
	return d.strAlpha(start, start + 6 * chars).replace(/0+$/, '').trim();
}

export interface TrenitaliaTicket {
	version: number;
	issuerRics: number;
	ticketType: number;
	/** Departure date (ISO). The payload holds only a day of the year. */
	departureDate: string | null;
	dayOfYear: number;
	trainNumber: number;
	/** Empty on tickets without a reservation, e.g. regional fares. */
	coach: number;
	seat: string;
	pnr: string;
	entitlementNumber: number;
}

function seatOf(d: Bits): string {
	const number = d.int(251, 257);
	if (!number) return '';
	return `${number}${d.strAlpha(257, 263).trim().replace(/^0$/, '')}`;
}

export function isTrenitalia(data: Uint8Array): boolean {
	if (data.length !== 67) return false;
	const version = (data[0] >> 4) & 0x0f;
	if (version !== 2) return false;
	const d = new Bits(data);
	// RICS 83 is Trenitalia; this variant uses ticket type 16
	return d.int(4, 18) === 83 && d.int(22, 27) === 16;
}

export function parseTrenitalia(data: Uint8Array, now: Date = new Date()): TrenitaliaTicket {
	if (!isTrenitalia(data)) throw new Error('not a Trenitalia barcode');
	const d = new Bits(data);
	const dayOfYear = d.int(43, 52);
	return {
		version: d.int(0, 4),
		issuerRics: d.int(4, 18),
		ticketType: d.int(22, 27),
		departureDate: resolveDayOfYear(dayOfYear, now),
		dayOfYear,
		trainNumber: d.int(177, 194),
		coach: d.int(246, 250),
		seat: seatOf(d),
		pnr: str(d, 270, 6),
		entitlementNumber: d.int(468, 500)
	};
}
