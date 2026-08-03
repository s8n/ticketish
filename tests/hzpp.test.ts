// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * HŽPP tickets, both the plaintext B1 form and the encrypted A1 one.
 *
 * Every payload is assembled by the `build` helper below from invented
 * values. The field order comes from zuegli; no value from a real ticket
 * appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isHzpp, parseHzpp } from '../src/lib/tickets/hzpp/hzpp.ts';

const latin1 = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** Minutes from the 2003 epoch to an instant, which is what the record stores. */
const minutes = (iso: string) =>
	Math.round((Date.parse(iso) / 1000 - 1041375600) / 60);

interface Parts {
	ticketNumber?: string;
	ticketType?: number;
	/** Minor units, as the record carries it. */
	price?: number;
	out?: [number, number, number, number, number];
	ret?: [number, number, number, number, number];
	validFrom?: string;
	validUntil?: string;
	pax1?: [number, number];
	pax2?: [number, number];
	extendedValidity?: boolean;
	issuedOnBoard?: boolean;
	outTrains?: [number, string, string, number, string, string];
	retTrains?: [number, string, string, number, string, string];
}

/** The 33 pipe separated fields, in the order zuegli reads them. */
function build(parts: Parts = {}): Uint8Array {
	const p = {
		ticketNumber: 'TEST0000001',
		ticketType: 10001,
		price: 1499,
		// from, to, via route, class, train type
		out: [72480, 76660, 0, 2, 100] as [number, number, number, number, number],
		ret: [0, 0, 0, 0, 0] as [number, number, number, number, number],
		validFrom: '2024-06-01T08:00:00Z',
		validUntil: '2024-06-02T08:00:00Z',
		pax1: [1, 11] as [number, number],
		pax2: [0, 0] as [number, number],
		extendedValidity: false,
		issuedOnBoard: false,
		outTrains: [0, '', '', 0, '', ''] as [number, string, string, number, string, string],
		retTrains: [0, '', '', 0, '', ''] as [number, string, string, number, string, string],
		...parts
	};

	const fields = [
		p.ticketNumber, // 0
		p.ticketType, // 1
		p.price, // 2
		...p.out, // 3-7
		...p.ret, // 8-12
		minutes(p.validFrom), // 13
		minutes(p.validUntil), // 14
		p.pax1[0], // 15
		p.pax1[1], // 16
		p.pax2[0], // 17
		p.pax2[1], // 18
		p.extendedValidity ? 1 : 0, // 19
		p.issuedOnBoard ? 1 : 0, // 20
		...p.outTrains, // 21-26
		...p.retTrains // 27-32
	];

	expect(fields).toHaveLength(33);
	return latin1('B1' + fields.join('|'));
}

/** An A1 payload: hex, whole AES blocks, IV in the last sixteen bytes. */
const encrypted = (blocks = 39) => latin1('A1' + 'ab'.repeat(blocks * 16) + 'cd'.repeat(16));

describe('HŽPP plaintext tickets', () => {
	it('reads the fields the ticket also prints', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('hzpp');
		if (c.kind !== 'hzpp' || c.ticket.encrypted) return;

		expect(c.ticket.ticketNumber).toBe('TEST0000001');
		expect(c.ticket.ticketType).toBe(10001);
		expect(c.ticket.ticketTypeName).toBe('Single trip 2nd class');
		expect(c.ticket.price).toBe(1499);
		expect(c.ticket.validFrom).toBe('2024-06-01T08:00:00Z');
		expect(c.ticket.validUntil).toBe('2024-06-02T08:00:00Z');
		expect(c.ticket.segments).toHaveLength(1);
		expect(c.ticket.segments[0].travelClassName).toBe('Second');
		expect(c.ticket.segments[0].trainTypeName).toBe('Regular train');
	});

	it('puts the country prefix back on the station codes', () => {
		// the record drops the 78 that makes them UIC codes
		const t = parseHzpp(build({ out: [72480, 76660, 0, 2, 100] }));
		if (t.encrypted) return;
		expect(t.segments[0].originStation).toBe(7872480);
		expect(t.segments[0].destinationStation).toBe(7876660);
	});

	it('counts its epoch in minutes from 2003 in Zagreb time', () => {
		// 2003-01-01T00:00:00+01:00, so the epoch itself is an hour before UTC midnight
		expect(minutes('2002-12-31T23:00:00Z')).toBe(0);
		// a zero counter is an unset field rather than the epoch itself
		const t = parseHzpp(build({ validFrom: '2002-12-31T23:00:00Z' }));
		if (t.encrypted) return;
		expect(t.validFrom).toBeNull();
	});

	it('prices in kuna before the euro switchover and in euro after it', () => {
		const before = parseHzpp(build({ validFrom: '2022-12-31T12:00:00Z' }));
		const after = parseHzpp(build({ validFrom: '2023-01-02T12:00:00Z' }));
		if (before.encrypted || after.encrypted) return;
		expect(before.currency).toBe('HRK');
		expect(after.currency).toBe('EUR');
	});

	it('reads a return leg only when the record carries one', () => {
		const single = parseHzpp(build());
		if (single.encrypted) return;
		expect(single.segments).toHaveLength(1);

		const round = parseHzpp(build({ ret: [76660, 72480, 0, 1, 102] }));
		if (round.encrypted) return;
		expect(round.segments).toHaveLength(2);
		expect(round.segments[1].originStation).toBe(7876660);
		expect(round.segments[1].travelClassName).toBe('First');
		expect(round.segments[1].trainTypeName).toBe('InterCity');
	});

	it('reads both train slots on a leg, skipping the empty ones', () => {
		const t = parseHzpp(build({ outTrains: [521, 'REF123', '12A', 0, '', ''] }));
		if (t.encrypted) return;
		expect(t.segments[0].trains).toEqual([
			{ trainNumber: 521, reservationReference: 'REF123', seat: '12A' }
		]);
	});

	it('reads both passenger categories, skipping the empty one', () => {
		const t = parseHzpp(build({ pax1: [2, 11], pax2: [1, 13] }));
		if (t.encrypted) return;
		expect(t.passengers).toEqual([
			{ passengerType: 11, passengerTypeName: 'Adult single', count: 2 },
			{ passengerType: 13, passengerTypeName: 'Child', count: 1 }
		]);
	});

	it('reads a return fare the way a real one is put together', () => {
		// the shape a plaintext ticket turned out to have: a return ticket type,
		// two segments running opposite ways over one route number, and a
		// passenger category that agrees with the ticket type
		const t = parseHzpp(
			build({
				ticketType: 10003,
				out: [75002, 75460, 1520, 2, 37],
				ret: [75460, 75002, 1520, 2, 37],
				pax1: [1, 12],
				price: 1318,
				validFrom: '2024-01-06T10:00:00Z',
				validUntil: '2024-01-08T22:59:00Z'
			})
		);
		if (t.encrypted) return;

		expect(t.ticketTypeName).toBe('Return trip 2nd class');
		expect(t.passengers).toEqual([
			{ passengerType: 12, passengerTypeName: 'Adult return', count: 1 }
		]);
		expect(t.currency).toBe('EUR');
		expect(t.price).toBe(1318);
		expect(t.validFrom).toBe('2024-01-06T10:00:00Z');
		expect(t.validUntil).toBe('2024-01-08T22:59:00Z');

		expect(t.segments).toHaveLength(2);
		// the return leg is the outward one backwards, over the same route
		expect(t.segments[0].originStation).toBe(t.segments[1].destinationStation);
		expect(t.segments[0].destinationStation).toBe(t.segments[1].originStation);
		expect(t.segments[0].routeNumber).toBe(1520);
		expect(t.segments[1].routeNumber).toBe(1520);
		expect(t.segments[0].trainTypeName).toBe('Regular train');
	});

	it('shows an unlisted code as the number rather than dropping it', () => {
		const t = parseHzpp(build({ ticketType: 19999, pax1: [1, 99], out: [72480, 76660, 0, 9, 77] }));
		if (t.encrypted) return;
		expect(t.ticketTypeName).toBe('Unknown (19999)');
		expect(t.passengers[0].passengerTypeName).toBe('Unknown (99)');
		expect(t.segments[0].travelClassName).toBe('Unknown (9)');
		expect(t.segments[0].trainTypeName).toBe('Unknown (77)');
	});
});

describe('HŽPP encrypted tickets', () => {
	it('recognises one without pretending to read it', () => {
		const c = parsePayload(encrypted());
		expect(c.kind).toBe('hzpp');
		if (c.kind !== 'hzpp') return;
		expect(c.ticket.encrypted).toBe(true);
		if (!c.ticket.encrypted) return;
		// 39 blocks of ciphertext plus the 16 byte IV
		expect(c.ticket.cipherLength).toBe(40 * 16);
	});

	it('does not fall through to the plain text view', () => {
		// which is what a hex string would otherwise be shown as
		expect(parsePayload(encrypted()).kind).not.toBe('text');
	});
});

describe('HŽPP detection', () => {
	it('rejects payloads that do not match either form', () => {
		expect(isHzpp(build())).toBe(true);
		expect(isHzpp(encrypted())).toBe(true);

		// the plaintext form is exactly 33 fields
		expect(isHzpp(latin1('B1' + 'x|'.repeat(10)))).toBe(false);
		// the encrypted form is hex, in whole blocks
		expect(isHzpp(latin1('A1' + 'zz'.repeat(320)))).toBe(false);
		expect(isHzpp(latin1('A1' + 'ab'.repeat(17)))).toBe(false);
		// another prefix entirely
		expect(isHzpp(latin1('C1' + 'ab'.repeat(320)))).toBe(false);
		expect(isHzpp(new Uint8Array(0))).toBe(false);
	});

	it('does not swallow the other pipe or hex shaped formats', () => {
		expect(isHzpp(latin1('eRIV' + '0'.repeat(120)))).toBe(false);
		expect(isHzpp(latin1(['TCDD_B', '6', '3', '0'].join('$').padEnd(120, '$')))).toBe(false);
	});
});
