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

const ALPHABET: Record<number, string> = (() => {
	const map: Record<number, string> = {};
	for (let i = 0; i < 10; i++) map[i] = String(i);
	for (let i = 0; i < 26; i++) map[10 + i] = String.fromCharCode(65 + i);
	map[36] = ' ';
	map[63] = '?';
	return map;
})();

function bit(d: Uint8Array, i: number): number {
	return (d[i >> 3] >> (7 - (i & 7))) & 1;
}

function int(d: Uint8Array, start: number, end: number): number {
	let v = 0;
	for (let i = start; i < end; i++) v = v * 2 + bit(d, i);
	return v;
}

/** 6-bit alphanumeric, zero-padded to the field width. */
function str(d: Uint8Array, start: number, chars: number): string {
	let s = '';
	for (let i = 0; i < chars; i++) s += ALPHABET[int(d, start + 6 * i, start + 6 * i + 6)] ?? ' ';
	return s.replace(/0+$/, '').trim();
}

function char(d: Uint8Array, start: number): string {
	return ALPHABET[int(d, start, start + 6)] ?? '';
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

/** Pick the year that puts this day-of-year closest to the reference date. */
function resolveDayOfYear(day: number, now: Date): string | null {
	if (!day || day > 366) return null;
	let best: Date | null = null;
	const year = now.getUTCFullYear();
	for (const candidate of [year - 1, year, year + 1]) {
		const date = new Date(Date.UTC(candidate, 0, 1));
		date.setUTCDate(date.getUTCDate() + day - 1);
		if (!best || Math.abs(date.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())) {
			best = date;
		}
	}
	return best ? best.toISOString().slice(0, 10) : null;
}

function seatOf(data: Uint8Array): string {
	const number = int(data, 251, 257);
	if (!number) return '';
	return `${number}${char(data, 257).replace(/^0$/, '')}`;
}

export function isTrenitalia(data: Uint8Array): boolean {
	if (data.length !== 67) return false;
	const version = (data[0] >> 4) & 0x0f;
	if (version !== 2) return false;
	// RICS 83 is Trenitalia; this variant uses ticket type 16
	return int(data, 4, 18) === 83 && int(data, 22, 27) === 16;
}

export function parseTrenitalia(data: Uint8Array, now: Date = new Date()): TrenitaliaTicket {
	if (!isTrenitalia(data)) throw new Error('not a Trenitalia barcode');
	const dayOfYear = int(data, 43, 52);
	return {
		version: int(data, 0, 4),
		issuerRics: int(data, 4, 18),
		ticketType: int(data, 22, 27),
		departureDate: resolveDayOfYear(dayOfYear, now),
		dayOfYear,
		trainNumber: int(data, 177, 194),
		coach: int(data, 246, 250),
		seat: seatOf(data),
		pnr: str(data, 270, 6),
		entitlementNumber: int(data, 468, 500)
	};
}
