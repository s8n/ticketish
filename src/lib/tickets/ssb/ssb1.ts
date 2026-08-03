// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: EUPL-1.2
// Ported from zuegli (EUPL-1.2), so it cannot also be offered under MIT.

/**
 * SSB1: the 107-byte bit-packed barcode used by VR (Finland) among others.
 * Layout ported from zuegli's main/ssb1 (EUPL-1.2).
 *
 * Dates are stored as a day of the year with no year, so the year is resolved
 * to whichever candidate lands closest to the reference date.
 */
import { Bits } from '../bits.ts';
import { resolveDayOfYear, timeOfDay } from '../dates.ts';

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

export function isSsb1(data: Uint8Array): boolean {
	if (data.length !== 107) return false;
	const version = (data[0] >> 4) & 0x0f;
	return version === 1 || version === 2;
}

export function parseSsb1(data: Uint8Array, now: Date = new Date()): Ssb1Ticket {
	if (!isSsb1(data)) throw new Error('not an SSB1 barcode');
	const d = new Bits(data);

	const stationOrName = (flagBit: number, numStart: number, numEnd: number, nameEnd: number) =>
		d.bool(flagBit) ? String(d.int(numStart, numEnd)) : d.strAlpha(numStart, nameEnd).trim();

	const slot = d.int(167, 173);
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
		departureTime: slot ? timeOfDay((slot - 1) * 30) : null,
		trainNumber: d.int(173, 190),
		reservationReference: d.int(190, 230),
		travelClass: d.strAlpha(230, 236).replace(/[?\s]/g, ''),
		coachNumber: d.int(236, 246),
		seat: `${d.int(246, 253)}${d.strAlpha(253, 259).trim()}`.replace(/^0+$/, ''),
		overbooked: d.bool(259),
		pnr: d.strAlpha(260, 302).trim(),
		ticketType: d.int(302, 306),
		specimen: !d.bool(306)
	};
}
