// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * NSB (now Vy) tickets, the Norwegian railway.
 *
 * The QR holds base64 text rather than bytes, and what it decodes to is
 * bit-packed binary opening with a fixed five byte signature. No
 * specification is published, zuegli has no parser for it, and
 * trainticket.wiki has no Norwegian page.
 *
 * Two fields are established, both eleven bit counts of minutes since
 * midnight:
 *
 *   bit 280  departure
 *   bit 305  arrival
 *
 * Those came from three tickets whose faces print their times. Four payloads
 * give eight values and every one is a time printed on its ticket, which is
 * not something a wrong offset does twice, let alone eight times.
 *
 * What is *not* settled is the scope of the pair. On the one ticket where
 * both of its two symbols could be read, each gives the times of its own leg.
 * On the other two only one symbol would decode, and there the pair is the
 * whole journey's start and end rather than either leg's. So the times are
 * reported without claiming which, and everything else in the record, the
 * stations, date, fare and reference number, is left alone: none of the
 * values printed on the faces turn up at any offset or width.
 *
 * Anyone picking this up wants cleaner scans first. The second symbol on two
 * of the three sample tickets will not decode at all, and reading them would
 * settle the leg question immediately.
 */
import { Bits } from '../bits.ts';
import { hex, isPrintableAscii } from '../bytes.ts';
import { timeOfDay } from '../dates.ts';

/** Every sample opens with this, and nothing else here does. */
const MAGIC = [0xe0, 0x00, 0x80, 0x01, 0x5f];

/** Shortest payload seen is 103 bytes; the signature alone is not enough. */
const MIN_BYTES = 90;

/** Minutes since midnight, as an eleven bit field. */
const DEPARTURE_BIT = 280;
const ARRIVAL_BIT = 305;
const TIME_BITS = 11;

export interface NsbTicket {
	/** Local time as printed, since the record carries no zone. */
	departure: string | null;
	arrival: string | null;
	/** The decoded payload, for anyone taking the format further. */
	bodyHex: string;
	byteLength: number;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(data: Uint8Array): Uint8Array | null {
	// base64 is ASCII, so anything else rules the payload out at once
	if (data.length < 120 || !isPrintableAscii(data)) return null;
	const text = new TextDecoder().decode(data);
	if (!BASE64.test(text)) return null;
	const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
	try {
		const binary = atob(padded);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

/** Minutes since midnight as HH:MM, or null when it is not a time of day. */
function departureOrNull(minutes: number): string | null {
	return minutes < 1440 ? timeOfDay(minutes) : null;
}

export function isNsb(data: Uint8Array): boolean {
	const body = decodeBase64(data);
	if (!body || body.length < MIN_BYTES) return false;
	return MAGIC.every((b, i) => body[i] === b);
}

export function parseNsb(data: Uint8Array): NsbTicket {
	const body = decodeBase64(data);
	if (!body || !isNsb(data)) throw new Error('not an NSB ticket');
	const d = new Bits(body);
	return {
		departure: departureOrNull(d.int(DEPARTURE_BIT, DEPARTURE_BIT + TIME_BITS)),
		arrival: departureOrNull(d.int(ARRIVAL_BIT, ARRIVAL_BIT + TIME_BITS)),
		byteLength: body.length,
		bodyHex: hex(body)
	};
}
