// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The .ics export. RFC 5545 is picky in ways that are invisible until a
 * calendar refuses the file, so the checks here are on the shape of the text
 * as much as on what it says: CRLF line endings, escaped separators, folded
 * long lines, and a time zone only where the ticket named one.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildIcs, calendarProblem, icsFileName } from '../src/lib/wallet/calendar.ts';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { tripFor } from '../src/lib/wallet/trip.ts';
import type { TripSummary } from '../src/lib/wallet/trip.ts';

const NOW = new Date('2026-08-03T10:00:00Z');

const journey: TripSummary = {
	shape: 'journey',
	issuer: 'Test Railways',
	product: 'Advance single',
	from: 'Alpha Hbf',
	to: 'Beta Hbf',
	train: 'ICE 1234',
	departure: '2026-09-01T08:15',
	arrival: '2026-09-01T11:42',
	travelClass: '2nd class',
	ticketId: 'TKT1',
	details: []
};

const period: TripSummary = {
	shape: 'period',
	issuer: 'Test Verbund',
	product: 'Test area pass',
	validFrom: '2026-09-01',
	validUntil: '2026-09-30',
	details: []
};

const ics = (trip: TripSummary) => buildIcs({ trip, uid: 'abc123@ticketish', now: NOW });
const lines = (text: string) => text.split('\r\n');

describe('a journey', () => {
	const text = ics(journey);

	it('is a timed event from the departure to the arrival', () => {
		expect(lines(text)).toContain('DTSTART:20260901T081500');
		expect(lines(text)).toContain('DTEND:20260901T114200');
	});

	it('writes a bare wall clock when the ticket named no zone', () => {
		// floating means the same clock time wherever it is read, which is all
		// a ticket without an offset actually claims
		expect(text).not.toMatch(/DTSTART[^\r\n]*Z/);
		expect(text).not.toContain('TZID');
		// the stamp is a real instant, so that one is in UTC
		expect(lines(text)).toContain('DTSTAMP:20260803T100000Z');
	});

	it('leads with the train, which is what a squeezed week view shows', () => {
		expect(lines(text)).toContain('SUMMARY:ICE 1234: Alpha Hbf ➡ Beta Hbf');
		expect(lines(text)).toContain('LOCATION:Alpha Hbf');
		expect(lines(text)).toContain('STATUS:CONFIRMED');
	});

	it('leaves out an end the barcode did not give, rather than inventing one', () => {
		const open = ics({ ...journey, arrival: undefined });
		expect(open).toContain('DTSTART:20260901T081500');
		expect(open).not.toContain('DTEND');
	});

	it('does not end the journey when the ticket expires', () => {
		// a day ticket is valid until the small hours; the train is not on it
		// that long, and an event that says so is worse than one with no end
		const open = ics({
			...journey,
			arrival: undefined,
			validFrom: '2026-09-01T00:00',
			validUntil: '2026-09-02T03:00'
		});
		expect(open).not.toContain('DTEND');
	});

	it('takes the same UID every time, so a second import is not a second entry', () => {
		expect(ics(journey)).toBe(ics(journey));
		expect(lines(text)).toContain('UID:abc123@ticketish');
	});
});

describe('a period ticket', () => {
	const text = ics(period);

	it('is an all-day event, ending the day after the last valid one', () => {
		expect(lines(text)).toContain('DTSTART;VALUE=DATE:20260901');
		// DTEND is exclusive, so 30 September valid means 1 October here
		expect(lines(text)).toContain('DTEND;VALUE=DATE:20261001');
	});

	it('is named by the product, having no route to be named by', () => {
		expect(lines(text)).toContain('SUMMARY:Test area pass');
	});
});

describe('the file itself', () => {
	it('is wrapped and terminated the way the standard says', () => {
		const text = ics(journey);
		expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(text).toContain('VERSION:2.0');
		// every line ends CRLF, and none is left bare
		expect(text.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
	});

	it('escapes the characters that would otherwise end a value', () => {
		const text = ics({
			...journey,
			from: 'Frankfurt (Main) Hbf, tief',
			via: 'A; B; C',
			product: 'back\\slash'
		});
		expect(text).toContain('LOCATION:Frankfurt (Main) Hbf\\, tief');
		expect(text).toContain('A\\; B\\; C');
		expect(text).toContain('back\\\\slash');
	});

	it('folds a long line and marks the continuation with a space', () => {
		const text = ics({ ...journey, passenger: 'A'.repeat(200) });
		const long = text.split('\r\n').filter((l) => l.startsWith('DESCRIPTION'));
		expect(long).toHaveLength(1);
		for (const line of text.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
		expect(text).toMatch(/\r\n [A-Za-z0-9]/);
	});

	it('counts the fold in octets, not characters', () => {
		// an umlaut is one character and two octets, so a line of them folds
		// sooner than its length suggests
		const text = ics({ ...journey, passenger: 'ü'.repeat(120) });
		for (const line of text.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it('says the pass was not issued by the operator, as the passes do', () => {
		expect(ics(journey)).toContain('Not issued by the operator');
	});

	it('names the file after the trip', () => {
		expect(icsFileName(journey)).toBe('alpha-hbf-to-beta-hbf.ics');
	});
});

describe('the time zone, where the ticket carries one', () => {
	const zoned = (offset: number) => ics({ ...journey, utcOffset: offset });

	it('hangs the times on a zone and defines it in the file', () => {
		const text = zoned(120);
		expect(lines(text)).toContain('DTSTART;TZID=Etc/GMT-2:20260901T081500');
		expect(lines(text)).toContain('DTEND;TZID=Etc/GMT-2:20260901T114200');
		// a TZID pointing at nothing is a time nobody has to honour
		expect(lines(text)).toContain('BEGIN:VTIMEZONE');
		expect(lines(text)).toContain('TZID:Etc/GMT-2');
		expect(lines(text)).toContain('TZOFFSETFROM:+0200');
		expect(lines(text)).toContain('TZOFFSETTO:+0200');
	});

	it('inverts the sign the way the Etc zones do', () => {
		// Etc/GMT-2 is UTC+2, which reads backwards and is correct
		expect(zoned(120)).toContain('TZID:Etc/GMT-2');
		expect(zoned(-300)).toContain('TZID:Etc/GMT+5');
		expect(zoned(0)).toContain('TZID:Etc/GMT');
	});

	it('names a zone of its own where no Etc zone fits', () => {
		const text = zoned(330);
		expect(text).toContain('TZID:UTC+05:30');
		expect(text).toContain('TZOFFSETTO:+0530');
	});

	it('leaves the wall clock alone, whichever zone it is in', () => {
		// the point of a zone here is to say what the printed time means, not
		// to move it
		expect(zoned(120)).toContain(':20260901T081500');
		expect(zoned(-300)).toContain(':20260901T081500');
	});
});

describe('what cannot become an event', () => {
	it('refuses a ticket that never says when', () => {
		const undated: TripSummary = { shape: 'period', issuer: 'Test', details: [] };
		expect(calendarProblem(undated)).toMatch(/does not say when/);
		expect(() => ics(undated)).toThrow(/does not say when/);
	});

	it('is happy with anything that has a date', () => {
		expect(calendarProblem(journey)).toBeNull();
		expect(calendarProblem(period)).toBeNull();
	});
});

describe('against a real ticket', () => {
	it('turns a DB journey into the event it describes', async () => {
		const path = join(fileURLToPath(new URL('./fixtures/public', import.meta.url)), 'muster-918-9-fv-supersparpreis.bin');
		if (!existsSync(path)) return;
		const trip = (await tripFor(makeTicket(new Uint8Array(readFileSync(path)), { kind: 'raw' })))!;
		const text = buildIcs({ trip, uid: 'test@ticketish', now: NOW });
		// the ticket carried departureUTCOffset -8, which is UTC+2
		expect(text).toContain('DTSTART;TZID=Etc/GMT-2:20220422T115900');
		expect(text).toContain('TZID:Etc/GMT-2');
		expect(text).toContain('TZOFFSETTO:+0200');
		expect(text).toContain('SUMMARY:ICE573: Mannheim ➡ Reutlingen');
		expect(text).toContain('Operator: DB AG');
	});
});
