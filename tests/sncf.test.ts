// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The SNCF e-billet record (i0CV).
 *
 * Every payload here is assembled from invented values by the `buildE` helper
 * below. The field offsets it uses were established from real tickets and
 * corroborated by two published reverse engineerings, but no value from a
 * real ticket appears in this file.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isElb } from '../src/lib/tickets/elb/elb.ts';
import { isSncfETicket, parseSncfETicket } from '../src/lib/tickets/sncf/eticket.ts';
import { buildElb } from './helpers/elb.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

interface EParts {
	magic?: string;
	pnr?: string;
	ticketNumber?: string;
	blockA?: string;
	dob?: string;
	origin?: string;
	destination?: string;
	train?: string;
	travelDate?: string;
	customerReference?: string;
	surname?: string;
	forename?: string;
	travelClass?: string;
	tariff?: string;
	returnBlock?: string;
}

/** Lay out the 131 character e-billet record field by field. */
function buildE(parts: EParts = {}): Uint8Array {
	const p = {
		magic: 'i0CV',
		pnr: 'TESTPN',
		ticketNumber: '123456789',
		blockA: '0011',
		dob: '01/02/1970',
		origin: 'FRAAA',
		destination: 'FRZZZ',
		train: '09999',
		travelDate: '26/04',
		customerReference: '0011122233344455566',
		surname: 'TESTSURNAME',
		forename: 'TESTFORENAME',
		travelClass: '2',
		tariff: 'XX99',
		returnBlock: '0'.repeat(16),
		...parts
	};

	const s =
		p.magic + // 0
		p.pnr + // 4
		p.ticketNumber + // 10
		p.blockA + // 19
		p.dob + // 23
		p.origin + // 33
		p.destination + // 38
		p.train + // 43
		p.travelDate + // 48
		p.customerReference + // 53, 19 characters
		p.surname.padStart(19, ' ') + // 72, right aligned in 19
		p.forename.padStart(19, ' ') + // 91, right aligned in 19
		p.travelClass + // 110
		p.tariff + // 111
		p.returnBlock; // 115, 16 characters

	expect(s.length).toBe(131);
	return ascii(s);
}

describe('SNCF e-billet records', () => {
	it('reads the fields that the printed ticket also shows', () => {
		const c = parsePayload(buildE());
		expect(c.kind).toBe('sncf-eticket');
		if (c.kind !== 'sncf-eticket') return;

		expect(c.ticket.pnr).toBe('TESTPN');
		expect(c.ticket.ticketNumber).toBe('123456789');
		expect(c.ticket.customerReference).toBe('0011122233344455566');
		expect(c.ticket.surname).toBe('TESTSURNAME');
		expect(c.ticket.forename).toBe('TESTFORENAME');
		expect(c.ticket.originCode).toBe('FRAAA');
		expect(c.ticket.destinationCode).toBe('FRZZZ');
		expect(c.ticket.trainNumber).toBe('9999');
		expect(c.ticket.travelClass).toBe('2');
		expect(c.ticket.tariffCode).toBe('XX99');
	});

	it('reads the travel date as day then month, with no year in the record', () => {
		// the day comes first, so this is 26 April rather than any month 26
		expect(parseSncfETicket(buildE({ travelDate: '26/04' })).travelDate).toEqual({
			day: 26,
			month: 4
		});
		expect(parseSncfETicket(buildE({ travelDate: '06/09' })).travelDate).toEqual({
			day: 6,
			month: 9
		});
		// an unset field is not a date
		expect(parseSncfETicket(buildE({ travelDate: '00/00' })).travelDate).toBeNull();
		expect(parseSncfETicket(buildE({ travelDate: '99/99' })).travelDate).toBeNull();
	});

	it('reads the date of birth as an ISO date and rejects impossible ones', () => {
		expect(parseSncfETicket(buildE({ dob: '01/02/1970' })).dateOfBirth).toBe('1970-02-01');
		expect(parseSncfETicket(buildE({ dob: '31/02/1970' })).dateOfBirth).toBeNull();
		expect(parseSncfETicket(buildE({ dob: '0000000000' })).dateOfBirth).toBeNull();
	});

	it('trims the right-aligned name fields', () => {
		const t = parseSncfETicket(buildE({ surname: 'AA', forename: 'BB' }));
		expect(t.surname).toBe('AA');
		expect(t.forename).toBe('BB');
	});

	it('leaves the return leg null unless the block carries something', () => {
		expect(parseSncfETicket(buildE()).returnLeg).toBeNull();
		expect(parseSncfETicket(buildE({ returnBlock: ' '.repeat(16) })).returnLeg).toBeNull();

		const t = parseSncfETicket(buildE({ returnBlock: '1FRZZZFRAAA08888' }));
		expect(t.returnLeg).toEqual({
			travelClass: '1',
			originCode: 'FRZZZ',
			destinationCode: 'FRAAA',
			trainNumber: '8888'
		});
	});

	it('keeps the block at offset 19 out of the way unless it is unexpected', () => {
		// both published reverse engineerings have it as a constant "1211"
		expect(parseSncfETicket(buildE({ blockA: '1211' })).extraFields).toEqual([]);
		expect(parseSncfETicket(buildE({ blockA: '0000' })).extraFields).toEqual([]);
		// anything else is worth showing, since nothing explains it
		expect(parseSncfETicket(buildE({ blockA: '0011' })).extraFields).toEqual(['0011']);
	});

	it('decodes names as ISO-8859-1 rather than rejecting the accents', () => {
		// ascii() writes one byte per code point, so these land as Latin-1 bytes
		const payload = buildE({ surname: 'ÉLODIE', forename: 'FRANÇOIS' });
		expect(payload.some((b) => b > 0x7e)).toBe(true);
		expect(isSncfETicket(payload)).toBe(true);

		const t = parseSncfETicket(payload);
		expect(t.surname).toBe('ÉLODIE');
		expect(t.forename).toBe('FRANÇOIS');
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isSncfETicket(buildE())).toBe(true);

		// wrong magic
		expect(isSncfETicket(buildE({ magic: 'i0CX' }))).toBe(false);
		// the record is a fixed 131 characters
		expect(isSncfETicket(ascii('i0CV'.padEnd(130, '0')))).toBe(false);
		expect(isSncfETicket(ascii('i0CV'.padEnd(132, '0')))).toBe(false);
		// control bytes are not text in any encoding
		expect(isSncfETicket(new Uint8Array(131))).toBe(false);
	});

	it('is kept apart from the ELB record on the same SNCF stock', () => {
		// the two share neither magic nor length
		expect(isElb(buildE())).toBe(false);
		expect(isSncfETicket(buildElb())).toBe(false);
		expect(parsePayload(buildElb()).kind).toBe('elb');
		expect(parsePayload(buildE()).kind).toBe('sncf-eticket');
	});
});
