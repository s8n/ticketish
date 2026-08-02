/**
 * TCDD, SSB1 (VR) and Trenitalia barcodes. Every expectation here was read
 * off the printed ticket that produced the fixture, so these tests pin the
 * reverse-engineered field offsets to ground truth rather than to the
 * parser's own output.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const fixture = (name: string) =>
	fileURLToPath(new URL(`./fixtures/private/${name}.bin`, import.meta.url));

const load = (name: string) => new Uint8Array(readFileSync(fixture(name)));

describe.skipIf(!existsSync(fixture('tr-tcdd-ankara-istanbul')))('TCDD tickets', () => {
	it('parses the Ankara to Istanbul ticket', () => {
		const c = parsePayload(load('tr-tcdd-ankara-istanbul'));
		expect(c.kind).toBe('tcdd');
		if (c.kind !== 'tcdd') return;
		// printed: train 81007, 21/01/2018 12:00, car 4, seat 6a, 54,00
		expect(c.ticket.pnr).toBe('TESTPNR01');
		expect(c.ticket.ticketNumber).toBe('240010TESTTKT1');
		expect(c.ticket.trainNumber).toBe('81007');
		expect(c.ticket.departure).toBe('2018-01-21T12:00');
		expect(c.ticket.purchased).toBe('2018-01-12T22:48');
		expect(c.ticket.coach).toBe('4');
		expect(c.ticket.seat).toBe('6a');
		expect(c.ticket.price).toBe('54.00');
		expect(c.ticket.checksum).toMatch(/^[0-9a-f]{40}$/);
	});

	it('parses the reverse journey with swapped station codes', () => {
		const a = parsePayload(load('tr-tcdd-ankara-istanbul'));
		const b = parsePayload(load('tr-tcdd-istanbul-ankara'));
		if (a.kind !== 'tcdd' || b.kind !== 'tcdd') return;
		expect(b.ticket.originCode).toBe(a.ticket.destinationCode);
		expect(b.ticket.destinationCode).toBe(a.ticket.originCode);
		expect(b.ticket.trainNumber).toBe('81032');
		expect(b.ticket.seat).toBe('6d');
	});
});

describe.skipIf(!existsSync(fixture('fi-vr-hki-tpe')))('VR (SSB1) tickets', () => {
	it('parses the Helsinki to Tampere ticket', () => {
		const c = parsePayload(load('fi-vr-hki-tpe'));
		expect(c.kind).toBe('ssb1');
		if (c.kind !== 'ssb1') return;
		// printed: 16.4. 14:00, train S 87, coach 2, seat 24, adult
		expect(c.ticket.issuerRics).toBe(10);
		expect(c.ticket.departureStation).toBe('HKI');
		expect(c.ticket.arrivalStation).toBe('TPE');
		expect(c.ticket.departureTime).toBe('14:00');
		expect(c.ticket.trainNumber).toBe(87);
		expect(c.ticket.coachNumber).toBe(2);
		expect(c.ticket.seat).toBe('24');
		expect(c.ticket.numAdults).toBe(1);
		expect(c.ticket.travelClass).toBe('2');
		expect(c.ticket.validFrom).toMatch(/-04-16$/);
	});

	it('parses the commuter return, which has no reserved seat', () => {
		const c = parsePayload(load('fi-vr-tpe-hki'));
		if (c.kind !== 'ssb1') return;
		expect(c.ticket.departureStation).toBe('TPE');
		expect(c.ticket.arrivalStation).toBe('HKI');
		expect(c.ticket.trainNumber).toBe(19734);
		// validity runs past midnight, so the end day is the following one
		expect(c.ticket.validUntil).toMatch(/-04-17$/);
	});
});

describe.skipIf(!existsSync(fixture('it-trenitalia-roma-firenze')))('Trenitalia tickets', () => {
	it('parses the fields confirmed against the printed ticket', () => {
		const c = parsePayload(load('it-trenitalia-roma-firenze'));
		expect(c.kind).toBe('trenitalia');
		if (c.kind !== 'trenitalia') return;
		// printed: carrier 1183, Frecciarossa 8418, seat 4D, PNR TESTAB,
		// entitlement number 1234567891
		expect(c.ticket.issuerRics).toBe(83);
		expect(c.ticket.trainNumber).toBe(8418);
		expect(c.ticket.seat).toBe('4D');
		expect(c.ticket.pnr).toBe('TESTAB');
		expect(c.ticket.entitlementNumber).toBe(1234567891);
	});
});
