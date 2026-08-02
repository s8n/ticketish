/**
 * SSB1: the 107-byte bit-packed barcode used by VR (Finland) among others.
 * Layout ported from zuegli's main/ssb1 (EUPL-1.2).
 *
 * Dates are stored as a day of the year with no year, so the year is resolved
 * to whichever candidate lands closest to the reference date.
 */

const ALPHABET: Record<number, string> = (() => {
	const map: Record<number, string> = {};
	for (let i = 0; i < 10; i++) map[i] = String(i);
	for (let i = 0; i < 26; i++) map[10 + i] = String.fromCharCode(65 + i);
	map[36] = ' ';
	map[63] = '?';
	return map;
})();

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
	/** 6-bit alphanumeric alphabet (not ASCII offset) */
	str(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += ALPHABET[this.int(i, i + 6)] ?? ' ';
		return s.trim();
	}
}

export interface Ssb1Ticket {
	version: number;
	issuerRics: number;
	returnIncluded: boolean;
	numberOfTickets: number;
	numAdults: number;
	numChildren: number;
	/** ISO dates, resolved from a day-of-year (see resolveDayOfYear) */
	validFrom: string | null;
	validUntil: string | null;
	frequentTravelerId: number | null;
	corporateTravelerId: number | null;
	departureStation: string;
	arrivalStation: string;
	/** HH:MM, in 30 minute slots */
	departureTime: string | null;
	trainNumber: number;
	reservationReference: number;
	travelClass: string;
	coachNumber: number;
	seat: string;
	overbooked: boolean;
	pnr: string;
	ticketType: number;
	specimen: boolean;
}

/** Pick the year that puts this day-of-year closest to the reference date. */
function resolveDayOfYear(day: number, now: Date): string | null {
	if (!day) return null;
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

export function isSsb1(data: Uint8Array): boolean {
	if (data.length !== 107) return false;
	const version = (data[0] >> 4) & 0x0f;
	return version === 1 || version === 2;
}

export function parseSsb1(data: Uint8Array, now: Date = new Date()): Ssb1Ticket {
	if (!isSsb1(data)) throw new Error('not an SSB1 barcode');
	const d = new Bits(data);

	const stationOrName = (flagBit: number, numStart: number, numEnd: number, nameEnd: number) =>
		d.bool(flagBit) ? String(d.int(numStart, numEnd)) : d.str(numStart, nameEnd);

	const slot = d.int(167, 173);
	const p = (n: number) => String(n).padStart(2, '0');
	const individual = d.bool(57);

	return {
		version: d.int(0, 4),
		issuerRics: d.int(4, 18),
		returnIncluded: d.bool(18),
		numberOfTickets: d.int(19, 25),
		numAdults: d.int(25, 32),
		numChildren: d.int(32, 39),
		validFrom: resolveDayOfYear(d.int(39, 48), now),
		validUntil: resolveDayOfYear(d.int(48, 57), now),
		frequentTravelerId: individual ? d.int(58, 105) : null,
		corporateTravelerId: individual ? null : d.int(58, 105),
		departureStation: stationOrName(105, 106, 126, 136),
		arrivalStation: stationOrName(136, 137, 157, 167),
		departureTime: slot ? `${p(Math.floor(((slot - 1) * 30) / 60))}:${p(((slot - 1) * 30) % 60)}` : null,
		trainNumber: d.int(173, 190),
		reservationReference: d.int(190, 230),
		travelClass: d.str(230, 236).replace(/[?\s]/g, ''),
		coachNumber: d.int(236, 246),
		seat: `${d.int(246, 253)}${d.str(253, 259)}`.replace(/^0+$/, ''),
		overbooked: d.bool(259),
		pnr: d.str(260, 302),
		ticketType: d.int(302, 306),
		specimen: !d.bool(306)
	};
}
