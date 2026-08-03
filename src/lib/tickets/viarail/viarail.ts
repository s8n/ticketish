// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * VIA Rail Canada boarding passes: a 124 character fixed-width ASCII record
 * in an Aztec code, space padded to whatever width the printer used.
 *
 * The layout follows the Kaitai specification at
 * https://github.com/NeoRail/train-barcode-kaitai-spec (`viarail/viarail.ksy`,
 * CC0), which the one sample here matches field for field with only padding
 * left over.
 *
 * Unlike most formats in this repo the record is entirely plaintext: no
 * compression, no signature, no check digit. Everything printed on the
 * boarding pass is in it, and nothing else is.
 *
 * Stations are VIA's own four letter codes (OTTW, MTRL). No table for them is
 * bundled, so they are shown as issued. Both timestamps are bare local time
 * at the station concerned, with no zone in the record, which matters in a
 * country spanning six of them.
 */

/** Fields through the purchase time. Printers pad past this with spaces. */
const LENGTH = 124;

/** Passenger types the specification lists. */
const PASSENGER_TYPES: Record<string, string> = {
	ADT: 'Adult',
	YTH: 'Youth',
	SEN: 'Senior',
	CHD: 'Child',
	INF: 'Infant',
	TUR: 'Group escort'
};

export interface ViaRailTicket {
	ticketNumber: string;
	surname: string;
	/** Given name as printed, which the record keeps in its own field. */
	givenName: string;
	car: string;
	seat: string;
	/** VIA's four letter station code, e.g. OTTW for Ottawa. */
	departureStation: string;
	arrivalStation: string;
	train: string;
	/** Local time at the departure station: the record carries no zone. */
	departureTime: string | null;
	/** VIA Préférence tier, P1 to P3, P1 being the lowest. */
	loyaltyLevel: string | null;
	/** Single letter fare bucket. No mapping for these is published. */
	inventoryClass: string | null;
	passengerType: string | null;
	/** Named where the specification lists the code, otherwise the code. */
	passengerTypeLabel: string | null;
	pnr: string;
	purchaseTime: string | null;
}

const isPrintableAscii = (data: Uint8Array) => data.every((b) => b >= 0x20 && b <= 0x7e);

/** YYYYMMDDHHMM, with optional seconds. Local time, so no zone is added. */
function timestamp(value: string): string | null {
	if (!/^\d{12}(\d{2})?$/.test(value)) return null;
	const [year, month, day, hour, minute] = [
		+value.slice(0, 4),
		+value.slice(4, 6),
		+value.slice(6, 8),
		+value.slice(8, 10),
		+value.slice(10, 12)
	];
	const second = value.length === 14 ? +value.slice(12, 14) : null;
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	if (hour > 23 || minute > 59 || (second !== null && second > 59)) return null;
	const pad = (n: number) => String(n).padStart(2, '0');
	const time = `${pad(hour)}:${pad(minute)}${second === null ? '' : `:${pad(second)}`}`;
	return `${year}-${pad(month)}-${pad(day)}T${time}`;
}

export function isViaRail(data: Uint8Array): boolean {
	if (data.length < LENGTH) return false;
	if (!isPrintableAscii(data)) return false;
	const s = new TextDecoder().decode(data);
	return (
		/^\d{13}$/.test(s.slice(0, 13)) &&
		// the two station codes sit together, then the train
		/^[A-Z]{8}$/.test(s.slice(50, 58)) &&
		timestamp(s.slice(65, 77)) !== null &&
		timestamp(s.slice(110, 124)) !== null
	);
}

export function parseViaRail(data: Uint8Array): ViaRailTicket {
	if (!isViaRail(data)) throw new Error('not a VIA Rail record');
	const s = new TextDecoder().decode(data);
	const passengerType = s.slice(101, 104).trim() || null;

	return {
		ticketNumber: s.slice(0, 13),
		surname: s.slice(13, 43).trim(),
		givenName: s.slice(77, 97).trim(),
		car: s.slice(43, 47).trim(),
		seat: s.slice(47, 50).trim(),
		departureStation: s.slice(50, 54),
		arrivalStation: s.slice(54, 58),
		train: s.slice(58, 65).trim(),
		departureTime: timestamp(s.slice(65, 77)),
		loyaltyLevel: s.slice(97, 99).trim() || null,
		inventoryClass: s.slice(99, 101).trim() || null,
		passengerType,
		passengerTypeLabel: passengerType ? (PASSENGER_TYPES[passengerType] ?? passengerType) : null,
		pnr: s.slice(104, 110),
		purchaseTime: timestamp(s.slice(110, 124))
	};
}
