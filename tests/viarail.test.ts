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
import { ascii } from './helpers/build.ts';
import { buildViaRail as build } from './helpers/viarail.ts';


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
		// a day the month does not have
		expect(isViaRail(build({ departureTime: '202402301607' }))).toBe(false);
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
