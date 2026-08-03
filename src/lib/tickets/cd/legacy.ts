// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The older České dráhy ticket barcode, magic `#CD01`.
 *
 * A fixed 63 bytes: the five character magic, then a little-endian binary
 * body. It predates ČD moving to SSB, and no specification for it is
 * published anywhere, zuegli included.
 *
 * Three fields are established, all of them OLE automation dates: an IEEE 754
 * double counting days since 1899-12-30, which is what Delphi's TDateTime is
 * and what a Windows point of sale of that era would have written.
 *
 *   offset 17  issued, to the minute
 *   offset 34  validity start, always midnight on the samples
 *   offset 42  validity end, midnight or 06:00 the next day
 *
 * Those were checked against a printed ticket face: it prints "01.07.14 04:59"
 * as the issuing stamp and "Platí od: 01.07.14 do: 02.07.14", and the three
 * doubles give exactly that. All three samples decode to dates matching the
 * year they were filed under.
 *
 * The rest is not placed. The remaining bytes hold what the face prints as a
 * point of sale code, a distance in km and a fare, but none of those values
 * turn up at any offset or width, so they are left as bytes rather than
 * guessed at. Stations are printed as names and are plainly not in 63 bytes.
 */

/** The whole record, magic included. */
const LENGTH = 63;

const MAGIC = '#CD01';

/** Days between the OLE epoch (1899-12-30) and the Unix one. */
const OLE_EPOCH_DAYS = 25569;

export interface CdLegacyTicket {
	/** Local time as printed, since the record carries no zone. */
	issued: string | null;
	validFrom: string | null;
	validUntil: string | null;
	/** Everything the layout does not account for, for anyone digging further. */
	bodyHex: string;
}

/**
 * An OLE automation date as a local ISO string. The record has no time zone,
 * and the face prints Czech local time, so nothing is converted: the value is
 * read as the wall clock it was written as.
 */
function oleDate(view: DataView, at: number): string | null {
	const days = view.getFloat64(at, true);
	if (!Number.isFinite(days) || days < 36526 || days > 55153) return null; // 2000 to 2051
	const ms = Math.round((days - OLE_EPOCH_DAYS) * 86400000);
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
		`T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
	);
}

const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

export function isCdLegacy(data: Uint8Array): boolean {
	if (data.length !== LENGTH) return false;
	for (let i = 0; i < MAGIC.length; i++) {
		if (data[i] !== MAGIC.charCodeAt(i)) return false;
	}
	// the issuing stamp has to be a date, which is what tells this apart from
	// anything else that might open with the same five bytes
	return oleDate(view(data), 17) !== null;
}

export function parseCdLegacy(data: Uint8Array): CdLegacyTicket {
	if (!isCdLegacy(data)) throw new Error('not a #CD01 ticket');
	const v = view(data);
	return {
		issued: oleDate(v, 17),
		validFrom: oleDate(v, 34),
		validUntil: oleDate(v, 42),
		bodyHex: [...data.subarray(MAGIC.length)]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	};
}
