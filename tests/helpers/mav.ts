// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Builds a synthetic MÁV barcode: a plaintext head, a gzip compressed body
 * laid out block by block as the Kaitai specification gives it, and a dummy
 * signature after it. Every value here is invented (see AGENTS.md).
 */
import { gzipSync } from 'fflate';

/** Seconds between the Unix epoch and 2017-01-01T00:00:00+01:00. */
export const MAV_EPOCH = 1483225200;

/** An ISO instant as the seconds-since-2017 the record stores. */
export const mavSeconds = (iso: string) =>
	Math.round(new Date(iso).getTime() / 1000) - MAV_EPOCH;

class Writer {
	bytes: number[] = [];
	u1(v: number) {
		this.bytes.push(v & 0xff);
		return this;
	}
	u2(v: number) {
		this.bytes.push((v >> 8) & 0xff, v & 0xff);
		return this;
	}
	u3(v: number) {
		this.bytes.push((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
		return this;
	}
	u4(v: number) {
		this.bytes.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
		return this;
	}
	f4(v: number) {
		const b = new Uint8Array(4);
		new DataView(b.buffer).setFloat32(0, v);
		this.bytes.push(...b);
		return this;
	}
	/** Fixed width UTF-8, NUL padded the way the real records are. */
	str(v: string, width: number) {
		const enc = new TextEncoder().encode(v);
		if (enc.length > width) throw new Error(`"${v}" does not fit in ${width} bytes`);
		this.bytes.push(...enc, ...new Array(width - enc.length).fill(0));
		return this;
	}
	zeros(n: number) {
		this.bytes.push(...new Array(n).fill(0));
		return this;
	}
	out() {
		return new Uint8Array(this.bytes);
	}
}

export interface MavTripParts {
	ticketName?: number;
	departureStation?: number;
	destinationStation?: number;
	via?: number[];
	viaReturn?: number[];
	travelClass?: string;
	/** 1 for a production ticket, 0 for a specimen. */
	production?: number;
	departureTime?: string;
	validityMinutes?: number;
	numPassengers?: number;
	discountName?: number;
}

export interface MavReservationParts {
	departureStation?: number;
	destinationStation?: number;
	ticketName?: number;
	departureTime?: string;
	operatorRics?: number;
	trainNumber?: string;
	coach?: string;
	seats?: [number, number];
}

export interface MavParts {
	version?: number;
	signingKeyId?: number;
	ticketNumber?: string;
	issuerRics?: number;
	issuedAt?: string;
	price?: number;
	ticketMedium?: number;
	person?: { name: string; birthDate: number; idCard: string } | null;
	trip?: MavTripParts | null;
	reservations?: MavReservationParts[];
	/** Bytes of dummy signature to append after the compressed block. */
	signatureLength?: number;
}

export function buildMav(parts: MavParts = {}): Uint8Array {
	const p = {
		version: 5,
		signingKeyId: 1,
		ticketNumber: '5500000X000000000',
		issuerRics: 1155,
		issuedAt: '2024-06-01T08:00:00Z',
		price: 1500,
		ticketMedium: 0xa7d59ea6,
		person: null,
		trip: {} as MavTripParts | null,
		reservations: [] as MavReservationParts[],
		signatureLength: 56,
		...parts
	};

	const body = new Writer();
	if (p.version < 5) body.str(p.ticketNumber, 18).u2(p.issuerRics);
	body.u4(mavSeconds(p.issuedAt));
	body.f4(p.price);
	body.u1((p.person ? 0x80 : 0) | (p.trip ? 0x01 : 0));
	body.u1(0); // supplement blocks
	body.u1(p.reservations.length);
	body.u1(0); // pass blocks
	body.zeros(3);
	body.u4(p.ticketMedium);

	const validity = (minutes: number) =>
		p.version <= 3 ? body.u2(minutes) : body.u3(minutes);

	if (p.person) body.str(p.person.name, 45).u4(p.person.birthDate).str(p.person.idCard, 15);

	if (p.trip) {
		const t = {
			ticketName: 0x11223344,
			departureStation: 5501016,
			destinationStation: 5510025,
			via: [] as number[],
			viaReturn: [] as number[],
			travelClass: '2',
			production: 1,
			departureTime: '2024-06-02T09:30:00Z',
			validityMinutes: 240,
			numPassengers: 1,
			discountName: 0x55667788,
			...p.trip
		};
		body.u4(t.ticketName).u3(t.departureStation).u3(t.destinationStation);
		// both route lists are a fixed 15 slots, zero filled
		for (const list of [t.via, t.viaReturn]) {
			for (let i = 0; i < 15; i++) body.u3(list[i] ?? 0);
		}
		body.str(t.travelClass, 1).u1(t.production).u4(mavSeconds(t.departureTime));
		validity(t.validityMinutes);
		body.u1(t.numPassengers).u4(t.discountName);
	}

	for (const raw of p.reservations) {
		const res = {
			departureStation: 5501016,
			destinationStation: 5510025,
			ticketName: 0x99aabbcc,
			departureTime: '2024-06-02T09:30:00Z',
			operatorRics: 1155,
			trainNumber: '999',
			coach: '12',
			seats: [45, 0] as [number, number],
			...raw
		};
		body
			.u3(res.departureStation)
			.u3(res.destinationStation)
			.u4(res.ticketName)
			.u4(mavSeconds(res.departureTime))
			.u2(res.operatorRics)
			.str(res.trainNumber, p.version >= 6 ? 20 : 5)
			.zeros(1)
			.str(res.coach, 3)
			.u2(res.seats[0])
			.u2(res.seats[1])
			.zeros(28);
	}

	const head = new Writer().u1(p.version).u1(p.signingKeyId);
	if (p.version >= 5) head.str(p.ticketNumber, 18).str(String(p.issuerRics), 4);

	const compressed = gzipSync(body.out());
	const signature = new Uint8Array(p.signatureLength).fill(0xab);
	const out = new Uint8Array(head.bytes.length + compressed.length + signature.length);
	out.set(head.out(), 0);
	out.set(compressed, head.bytes.length);
	out.set(signature, head.bytes.length + compressed.length);
	return out;
}
