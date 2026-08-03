// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * NSB tickets, of which only the two time fields are placed.
 *
 * Payloads come from the `build` helper below, which writes the signature and
 * the two times into an otherwise empty record. No value from a real ticket
 * appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isNsb, parseNsb } from '../src/lib/tickets/nsb/nsb.ts';

const MAGIC = [0xe0, 0x00, 0x80, 0x01, 0x5f];

/** Minutes since midnight, as the eleven bit field the record uses. */
const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};

function writeBits(d: Uint8Array, start: number, width: number, value: number) {
	for (let i = 0; i < width; i++) {
		if ((value >> (width - 1 - i)) & 1) d[(start + i) >> 3] |= 0x80 >> ((start + i) & 7);
	}
}

/** Base64 of a record carrying the signature and the two times. */
function build({
	departure = '11:50',
	arrival = '12:35',
	bytes = 103,
	magic = MAGIC
} = {}): Uint8Array {
	const body = new Uint8Array(bytes);
	magic.forEach((b, i) => (body[i] = b));
	if (departure) writeBits(body, 280, 11, minutes(departure));
	if (arrival) writeBits(body, 305, 11, minutes(arrival));
	const b64 = Buffer.from(body).toString('base64').replace(/=+$/, '');
	return new TextEncoder().encode(b64);
}

describe('NSB tickets', () => {
	it('reads the two times, which are all that is placed', () => {
		const c = parsePayload(build({ departure: '13:01', arrival: '14:59' }));
		expect(c.kind).toBe('nsb');
		if (c.kind !== 'nsb') return;

		expect(c.ticket.departure).toBe('13:01');
		expect(c.ticket.arrival).toBe('14:59');
	});

	it('holds a time past the ten bit ceiling, which is why the field is eleven', () => {
		// 17:55 is 1075 minutes, which does not fit in ten bits
		const t = parseNsb(build({ departure: '17:55', arrival: '06:51' }));
		expect(t.departure).toBe('17:55');
		expect(t.arrival).toBe('06:51');
	});

	it('reads midnight and the last minute of the day', () => {
		const t = parseNsb(build({ departure: '00:00', arrival: '23:59' }));
		expect(t.departure).toBe('00:00');
		expect(t.arrival).toBe('23:59');
	});

	it('keeps the payload it cannot read', () => {
		const t = parseNsb(build({ bytes: 123 }));
		expect(t.byteLength).toBe(123);
		expect(t.bodyHex).toHaveLength(123 * 2);
		expect(t.bodyHex.startsWith('e00080015f')).toBe(true);
	});

	it('rejects anything without the signature', () => {
		expect(isNsb(build())).toBe(true);

		expect(isNsb(build({ magic: [0xe0, 0x00, 0x80, 0x01, 0x60] }))).toBe(false);
		expect(isNsb(build({ magic: [0, 0, 0, 0, 0] }))).toBe(false);
		// too short to be one of these records
		expect(isNsb(build({ bytes: 80 }))).toBe(false);
	});

	it('rejects text that is not base64 at all', () => {
		expect(isNsb(new TextEncoder().encode('#UT01' + 'x'.repeat(200)))).toBe(false);
		expect(isNsb(new TextEncoder().encode('not base64! '.repeat(20)))).toBe(false);
		// binary payloads are not this format either
		expect(isNsb(new Uint8Array(200))).toBe(false);
	});

	it('does not swallow the other base64 shaped payloads', () => {
		// plain base64 of the right length but the wrong signature
		const other = Buffer.from(new Uint8Array(120).fill(0x41)).toString('base64');
		expect(isNsb(new TextEncoder().encode(other))).toBe(false);
	});
});
