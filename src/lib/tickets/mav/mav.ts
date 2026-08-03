// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * MÁV (Hungarian State Railways) ticket barcodes, versions 2 to 6.
 *
 * A short plaintext head, a gzip compressed body, and a signature appended
 * after it. The body is a header of counters followed by optional blocks: a
 * named person, the trip itself, then any number of supplement, reservation
 * and pass blocks. Issued as both Aztec and PDF417, so the symbology says
 * nothing about the layout.
 *
 * The layout follows the Kaitai specification at
 * https://github.com/NeoRail/train-barcode-kaitai-spec (`mav/mav.ksy`, CC0),
 * with the additions from Volker Krause's branch: the ticket medium enum, and
 * the validity length being two bytes on versions 2 and 3 where later ones
 * give it three. Background at
 * https://trainticket.wiki/ticket-standards/domestic-standards/hungary/.
 *
 * Both sample tickets parse to the byte, with nothing left over, which is
 * what the block counters make checkable: an offset that is wrong anywhere
 * leaves the reader short or long at the end.
 *
 * Two things stay unresolved. The 32 bit identifiers for ticket names,
 * discounts and passes are opaque, with no published mapping, so they are
 * shown as hex. And the station numbering changes: up to version 4 the codes
 * are seven digit UIC ones, which the bundled station table names, while from
 * version 5 they are MÁV's own numbering, for which no table is bundled.
 *
 * The pre-2020 MÁV format is a different thing entirely, a zlib compressed
 * pipe delimited text QR. No sample of it is available here, so it is not
 * read.
 */
import { inflateSync } from 'fflate';
import { pad } from '../dates.ts';
import { uicStationName, type StationTable } from '../stations.ts';

/** Seconds between the Unix epoch and 2017-01-01T00:00:00+01:00. */
const MAV_EPOCH = 1483225200;

/** Where a ticket was issued, by the 32 bit code the record carries. */
const MEDIA: Record<number, string> = {
	0x236d0520: 'PDF from the app',
	0x338797fe: 'PDF from the website',
	0x54a5b34d: 'Thermal paper from an EMKE machine',
	0x691b8d67: 'Hologram paper from Volánbusz',
	0xa7d59ea6: 'Paper from a vending machine',
	0xc785b60c: 'BKK paper pass',
	0xf8b405cd: 'Thermal paper from a ticket inspector'
};

export interface MavPerson {
	name: string;
	/** ISO date, or null when the packed value is not one. */
	dateOfBirth: string | null;
	idCardNumber: string | null;
}

export interface MavTrip {
	/** Opaque 32 bit ticket type id, shown as hex: no mapping is published. */
	ticketName: number;
	departureStation: number;
	destinationStation: number;
	/** Route points, blank entries dropped. */
	via: number[];
	viaReturn: number[];
	travelClass: string;
	departureTime: string | null;
	/** Length of the validity period in minutes. */
	validityMinutes: number;
	numPassengers: number;
	discountName: number;
}

export interface MavSupplement {
	departureStation: number;
	destinationStation: number;
	travelClass: string;
	ticketName: number;
	validFrom: string | null;
	validityMinutes: number;
	numPassengers: number;
	discountName: number;
}

export interface MavReservation {
	departureStation: number;
	destinationStation: number;
	ticketName: number;
	departureTime: string | null;
	/** RICS code of the carrier running the reserved train. */
	operatorRics: number;
	trainNumber: string;
	coach: string;
	seats: number[];
}

export interface MavPass {
	passName: number;
	discountNames: number[];
	validFrom: string | null;
	validityMinutes: number;
	numPassengers: number;
}

export interface MavTicket {
	version: number;
	/** Which of the issuer's keys signed the record. Signatures are not checked. */
	signingKeyId: number;
	ticketNumber: string;
	/** RICS code of the issuer, 1155 for MÁV. */
	issuerRics: number | null;
	issuedAt: string | null;
	/** Face value in forint. */
	price: number;
	ticketMedium: string | null;
	ticketMediumCode: number;
	/** The record says 1 for a production ticket and 0 for a specimen. */
	specimen: boolean;
	/**
	 * Which numbering the station ids use. UIC codes can be named from the
	 * bundled table; MÁV's own numbering cannot.
	 */
	stationNumbering: 'uic' | 'mav';
	person: MavPerson | null;
	trip: MavTrip | null;
	supplements: MavSupplement[];
	reservations: MavReservation[];
	passes: MavPass[];
}

/** Versions this layout is known to cover. */
const MIN_VERSION = 2;
const MAX_VERSION = 6;

/** From version 5 the ticket number and issuer moved out of the compressed body. */
const headStart = (version: number) => (version >= 5 ? 24 : 2);

const isGzip = (d: Uint8Array, at: number) => d[at] === 0x1f && d[at + 1] === 0x8b;

export function isMav(data: Uint8Array): boolean {
	if (data.length < 40) return false;
	const version = data[0];
	if (version < MIN_VERSION || version > MAX_VERSION) return false;
	const at = headStart(version);
	if (data.length < at + 20 || !isGzip(data, at)) return false;
	if (version >= 5) {
		// the plaintext head carries the ticket number then a numeric issuer
		for (let i = 20; i < 24; i++) if (data[i] < 0x30 || data[i] > 0x39) return false;
	}
	return true;
}

/**
 * Inflate the body.
 *
 * fflate's gunzipSync takes the uncompressed size from the last four bytes of
 * what it is given, which here is the tail of the signature rather than the
 * gzip trailer. So the header is stepped over by hand and the deflate stream
 * inflated on its own, which stops at its own end and ignores what follows.
 */
function inflateBody(data: Uint8Array, at: number): Uint8Array {
	const flags = data[at + 3];
	let p = at + 10;
	if (flags & 0x04) p += 2 + (data[p] | (data[p + 1] << 8)); // FEXTRA
	if (flags & 0x08) while (p < data.length && data[p++] !== 0); // FNAME
	if (flags & 0x10) while (p < data.length && data[p++] !== 0); // FCOMMENT
	if (flags & 0x02) p += 2; // FHCRC
	if (p >= data.length) throw new Error('MÁV body is truncated');
	return inflateSync(data.subarray(p));
}

class Reader {
	private at = 0;
	private view: DataView;
	constructor(private data: Uint8Array) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}
	private need(n: number) {
		if (this.at + n > this.data.length) throw new Error('MÁV block runs past the record');
	}
	u1(): number {
		this.need(1);
		return this.data[this.at++];
	}
	u2(): number {
		this.need(2);
		const v = this.view.getUint16(this.at);
		this.at += 2;
		return v;
	}
	u3(): number {
		this.need(3);
		const v = (this.data[this.at] << 16) | (this.data[this.at + 1] << 8) | this.data[this.at + 2];
		this.at += 3;
		return v >>> 0;
	}
	u4(): number {
		this.need(4);
		const v = this.view.getUint32(this.at);
		this.at += 4;
		return v;
	}
	f4(): number {
		this.need(4);
		const v = this.view.getFloat32(this.at);
		this.at += 4;
		return v;
	}
	/** Fixed-width UTF-8, NUL and space padded. */
	str(n: number): string {
		this.need(n);
		const s = new TextDecoder().decode(this.data.subarray(this.at, this.at + n));
		this.at += n;
		return s.replace(/\0/g, '').trim();
	}
	skip(n: number) {
		this.need(n);
		this.at += n;
	}
}

/** Seconds since 2017 as an ISO instant. Zero means the field is unset. */
function timestamp(seconds: number): string | null {
	if (!seconds) return null;
	return new Date((seconds + MAV_EPOCH) * 1000).toISOString().replace('.000Z', 'Z');
}

/** Birth dates are packed as year * 10000 + month * 100 + day. */
function birthDate(packed: number): string | null {
	if (!packed) return null;
	const year = Math.floor(packed / 10000);
	const month = Math.floor((packed - year * 10000) / 100);
	const day = packed - year * 10000 - month * 100;
	if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseMav(data: Uint8Array): MavTicket {
	if (!isMav(data)) throw new Error('not a MÁV record');
	const version = data[0];
	const at = headStart(version);
	const r = new Reader(inflateBody(data, at));

	// Versions 2 to 4 keep the ticket number and issuer inside the compressed
	// body; from 5 they sit in the plaintext head so a reader can see them
	// without inflating anything.
	let ticketNumber: string;
	let issuerRics: number | null;
	if (version >= 5) {
		const head = new TextDecoder().decode(data.subarray(2, 24));
		ticketNumber = head.slice(0, 18).replace(/\0/g, '').trim();
		issuerRics = parseInt(head.slice(18, 22), 10);
	} else {
		ticketNumber = r.str(18);
		issuerRics = r.u2();
	}

	const issuedAt = timestamp(r.u4());
	const price = r.f4();
	const flags = r.u1();
	const supplementCount = r.u1();
	const reservationCount = r.u1();
	const passCount = r.u1();
	r.skip(3);
	const ticketMediumCode = r.u4();

	// Validity lengths are two bytes on the older versions and three later.
	const validity = () => (version <= 3 ? r.u2() : r.u3());
	/** Route points are a fixed 15 slots each way, mostly empty. */
	const route = () => Array.from({ length: 15 }, () => r.u3()).filter((s) => s !== 0);

	const person: MavPerson | null =
		flags & 0x80
			? { name: r.str(45), dateOfBirth: birthDate(r.u4()), idCardNumber: r.str(15) || null }
			: null;

	let trip: MavTrip | null = null;
	let specimen = false;
	if (flags & 0x01) {
		const ticketName = r.u4();
		const departureStation = r.u3();
		const destinationStation = r.u3();
		const via = route();
		const viaReturn = route();
		const travelClass = r.str(1);
		specimen = r.u1() === 0;
		trip = {
			ticketName,
			departureStation,
			destinationStation,
			via,
			viaReturn,
			travelClass,
			departureTime: timestamp(r.u4()),
			validityMinutes: validity(),
			numPassengers: r.u1(),
			discountName: r.u4()
		};
	}

	const supplements: MavSupplement[] = [];
	for (let i = 0; i < supplementCount; i++) {
		supplements.push({
			departureStation: r.u3(),
			destinationStation: r.u3(),
			travelClass: r.str(1),
			ticketName: r.u4(),
			validFrom: timestamp(r.u4()),
			validityMinutes: validity(),
			numPassengers: r.u1(),
			discountName: r.u4()
		});
	}

	const reservations: MavReservation[] = [];
	for (let i = 0; i < reservationCount; i++) {
		const departureStation = r.u3();
		const destinationStation = r.u3();
		const ticketName = r.u4();
		const departureTime = timestamp(r.u4());
		const operatorRics = r.u2();
		const trainNumber = r.str(version >= 6 ? 20 : 5);
		r.skip(1);
		const coach = r.str(3);
		const seats = [r.u2(), r.u2()].filter((s) => s !== 0);
		r.skip(28);
		reservations.push({
			departureStation,
			destinationStation,
			ticketName,
			departureTime,
			operatorRics,
			trainNumber,
			coach,
			seats
		});
	}

	const passes: MavPass[] = [];
	for (let i = 0; i < passCount; i++) {
		passes.push({
			passName: r.u4(),
			discountNames: [r.u4(), r.u4()].filter((d) => d !== 0),
			validFrom: timestamp(r.u4()),
			validityMinutes: validity(),
			numPassengers: r.u1()
		});
	}

	return {
		version,
		signingKeyId: data[1],
		ticketNumber,
		issuerRics: Number.isFinite(issuerRics) ? issuerRics : null,
		issuedAt,
		price,
		ticketMedium: MEDIA[ticketMediumCode] ?? null,
		ticketMediumCode,
		specimen,
		stationNumbering: version >= 5 ? 'mav' : 'uic',
		person,
		trip,
		supplements,
		reservations,
		passes
	};
}

/**
 * Name a station id when it can be named. Only the UIC numbering has a table
 * here; MÁV's own is shown as the raw code.
 */
export function mavStationLabel(
	ticket: MavTicket,
	names: StationTable | null,
	id: number
): string | null {
	if (!id) return null;
	if (ticket.stationNumbering !== 'uic') return String(id);
	return uicStationName(names, id) ?? String(id);
}
