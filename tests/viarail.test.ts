// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * VIA Rail Canada boarding passes.
 *
 * Every payload is laid out field by field by the `build` helper below, from
 * invented values. The offsets come from the Kaitai specification; no value
 * from a real ticket appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isViaRail, parseViaRail } from '../src/lib/tickets/viarail/viarail.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

interface Parts {
	ticketNumber?: string;
	surname?: string;
	car?: string;
	seat?: string;
	departureStation?: string;
	arrivalStation?: string;
	train?: string;
	departureTime?: string;
	givenName?: string;
	loyalty?: string;
	inventoryClass?: string;
	passengerType?: string;
	pnr?: string;
	purchaseTime?: string;
	/** Printers pad past the last field; the samples run to 130. */
	length?: number;
}

/** Lay the fixed-width record out field by field, then pad. */
function build(parts: Parts = {}): Uint8Array {
	const p = {
		ticketNumber: '1234567890123',
		surname: 'TESTSURNAME',
		car: '1',
		seat: '11B',
		departureStation: 'AAAA',
		arrivalStation: 'ZZZZ',
		train: 'VIA99',
		departureTime: '202406021607',
		givenName: 'TESTGIVEN',
		loyalty: 'P3',
		inventoryClass: 'J',
		passengerType: 'ADT',
		pnr: 'K00XYZ',
		purchaseTime: '20240601101002',
		length: 130,
		...parts
	};

	const s =
		p.ticketNumber + // 0
		p.surname.padEnd(30, ' ') + // 13
		p.car.padEnd(4, ' ') + // 43
		p.seat.padEnd(3, ' ') + // 47
		p.departureStation + // 50
		p.arrivalStation + // 54
		p.train.padEnd(7, ' ') + // 58
		p.departureTime + // 65
		p.givenName.padEnd(20, ' ') + // 77
		p.loyalty.padEnd(2, ' ') + // 97
		p.inventoryClass.padEnd(2, ' ') + // 99
		p.passengerType.padEnd(3, ' ') + // 101
		p.pnr + // 104
		p.purchaseTime; // 110

	expect(s.length).toBe(124);
	return ascii(s.padEnd(p.length, ' '));
}

describe('VIA Rail boarding passes', () => {
	it('reads the fields the boarding pass also prints', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('viarail');
		if (c.kind !== 'viarail') return;

		expect(c.ticket.ticketNumber).toBe('1234567890123');
		expect(c.ticket.surname).toBe('TESTSURNAME');
		expect(c.ticket.givenName).toBe('TESTGIVEN');
		expect(c.ticket.car).toBe('1');
		expect(c.ticket.seat).toBe('11B');
		expect(c.ticket.departureStation).toBe('AAAA');
		expect(c.ticket.arrivalStation).toBe('ZZZZ');
		expect(c.ticket.train).toBe('VIA99');
		expect(c.ticket.pnr).toBe('K00XYZ');
		expect(c.ticket.inventoryClass).toBe('J');
		expect(c.ticket.loyaltyLevel).toBe('P3');
	});

	it('keeps both timestamps as local time, with no zone invented', () => {
		// the record carries no zone, and Canada spans six of them
		const t = parseViaRail(build());
		expect(t.departureTime).toBe('2024-06-02T16:07');
		expect(t.purchaseTime).toBe('2024-06-01T10:10:02');
	});

	it('names the passenger types the specification lists', () => {
		for (const [code, label] of [
			['ADT', 'Adult'],
			['YTH', 'Youth'],
			['SEN', 'Senior'],
			['CHD', 'Child'],
			['INF', 'Infant'],
			['TUR', 'Group escort']
		]) {
			const t = parseViaRail(build({ passengerType: code }));
			expect(t.passengerType).toBe(code);
			expect(t.passengerTypeLabel).toBe(label);
		}
	});

	it('shows an unlisted passenger type as its code rather than dropping it', () => {
		expect(parseViaRail(build({ passengerType: 'XXX' })).passengerTypeLabel).toBe('XXX');
	});

	it('reads a record with no padding past the last field', () => {
		expect(parseViaRail(build({ length: 124 })).pnr).toBe('K00XYZ');
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isViaRail(build())).toBe(true);

		// letters where the ticket number belongs
		expect(isViaRail(build({ ticketNumber: 'ABCDEFGHIJKLM' }))).toBe(false);
		// digits where the station codes belong
		expect(isViaRail(build({ departureStation: '1234' }))).toBe(false);
		// a departure time that is not a time
		expect(isViaRail(build({ departureTime: '202413991607' }))).toBe(false);
		expect(isViaRail(build({ departureTime: '202406029967' }))).toBe(false);
		// a purchase time that is not one
		expect(isViaRail(build({ purchaseTime: '20240601101099' }))).toBe(false);
		// truncated inside the record
		expect(isViaRail(ascii(new TextDecoder().decode(build()).slice(0, 123)))).toBe(false);
		// not printable ASCII
		expect(isViaRail(new Uint8Array(130))).toBe(false);
	});

	it('does not swallow the other fixed-width ASCII formats', () => {
		// ELB opens with a lowercase "e", not a digit
		expect(isViaRail(ascii('eRIV' + '0'.repeat(126)))).toBe(false);
		expect(isViaRail(ascii(['TCDD_B', '6', '3', '0'].join('$').padEnd(130, '$')))).toBe(false);
	});
});
