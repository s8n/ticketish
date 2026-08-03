// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * ELB, the Element List Barcode of ERA TAP TSI B.12 section 8.
 *
 * Every payload is assembled by tests/helpers/elb.ts from invented values.
 * The field offsets it uses come from B.12's element table; no value from a
 * real ticket appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isElb, parseElb } from '../src/lib/tickets/elb/elb.ts';
import { dayOfYearDate, lastDigitYear } from '../src/lib/tickets/dates.ts';
import { buildElb, elbSegment } from './helpers/elb.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** Fixed so the single year digit resolves the same way on every run. */
const NOW = new Date('2026-08-03T00:00:00Z');

describe('ELB records', () => {
	it('reads the fields that the printed ticket also shows', () => {
		const c = parsePayload(buildElb());
		expect(c.kind).toBe('elb');
		if (c.kind !== 'elb') return;

		expect(c.ticket.pnr).toBe('TESTPN');
		expect(c.ticket.ticketNumber).toBe('123456789');
		expect(c.ticket.segments).toHaveLength(1);
		const [leg] = c.ticket.segments;
		expect(leg.departureStation).toBe('FRAAA');
		expect(leg.arrivalStation).toBe('GBZZZ');
		expect(leg.trainNumber).toBe('9999');
		expect(leg.coach).toBe('3');
		expect(leg.seat).toBe('7');
		expect(leg.travelClass).toBe('2');
		expect(leg.tariffCode).toBe('XX99');
		expect(leg.classOfService).toBe('QQ');
	});

	it('exposes the ticket code that is printed ahead of the number', () => {
		// tickets print the number as "IV<number>", "IZ<number>", "DV<number>"
		for (const [pectab, code] of [
			['R', 'IV'],
			['R', 'IZ'],
			['E', 'DV']
		]) {
			const t = parseElb(buildElb({ pectab, ticketCode: code }));
			expect(t.pectab).toBe(pectab);
			expect(t.ticketCode).toBe(code);
		}
	});

	it('reads the three digit coach, not just its last two digits', () => {
		// B.12 puts the coach at 72-74. Reading it from 73 happens to work for
		// every two digit coach, since the field is zero padded.
		expect(parseElb(buildElb({ segment1: { coach: '007' } })).segments[0].coach).toBe('7');
		expect(parseElb(buildElb({ segment1: { coach: '016' } })).segments[0].coach).toBe('16');
		expect(parseElb(buildElb({ segment1: { coach: '112' } })).segments[0].coach).toBe('112');
	});

	it('keeps a fare letter in the class field rather than mapping it', () => {
		expect(parseElb(buildElb({ segment1: { travelClass: 'H' } })).segments[0].travelClass).toBe('H');
		expect(parseElb(buildElb({ segment1: { travelClass: '1' } })).segments[0].travelClass).toBe('1');
	});

	it('reads the specimen flag, which B.12 inverts from the obvious reading', () => {
		// 1 is a real ticket and 0 is a specimen
		expect(parseElb(buildElb({ specimen: '1' })).specimen).toBe(false);
		expect(parseElb(buildElb({ specimen: '0' })).specimen).toBe(true);
	});

	it('reads the passenger counts and the ticket sequence', () => {
		const t = parseElb(buildElb({ adults: '02', children: '03', sequence: '13' }));
		expect(t.numAdults).toBe(2);
		expect(t.numChildren).toBe(3);
		expect(t.ticketInSequence).toBe(1);
		expect(t.ticketsInSequence).toBe(3);
	});

	describe('dates', () => {
		it('resolves the year digit and the days of the year around it', () => {
			const t = parseElb(
				buildElb({ year: '4', emissionDay: '254', beginDay: '266', endDay: '300' }),
				NOW
			);
			expect(t.year).toBe(2024);
			expect(t.issuedDate).toBe('2024-09-10');
			expect(t.validFrom).toBe('2024-09-22');
			expect(t.validUntil).toBe('2024-10-26');
		});

		it('rolls end of validity into the next year when it falls before the start', () => {
			const t = parseElb(buildElb({ year: '4', beginDay: '339', endDay: '156' }), NOW);
			expect(t.validFrom).toBe('2024-12-04');
			expect(t.validUntil).toBe('2025-06-05');
		});

		it('dates the departure from the segment, against the same year', () => {
			const t = parseElb(buildElb({ year: '4', segment1: { departureDay: '266' } }), NOW);
			expect(t.segments[0].departureDay).toBe(266);
			expect(t.segments[0].departureDate).toBe('2024-09-22');
		});

		it('leaves the dates null when the record does not carry them', () => {
			const t = parseElb(
				buildElb({ year: ' ', emissionDay: '000', beginDay: '000', endDay: '000' }),
				NOW
			);
			expect(t.year).toBeNull();
			expect(t.issuedDate).toBeNull();
			expect(t.validFrom).toBeNull();
			expect(t.validUntil).toBeNull();
		});
	});

	it('reads a second segment, and only when one is really there', () => {
		expect(parseElb(buildElb()).segments).toHaveLength(1);

		const t = parseElb(
			buildElb({
				segment2: { departure: 'GBZZZ', arrival: 'FRAAA', train: '08888 ', seat: '021' }
			}),
			NOW
		);
		expect(t.segments).toHaveLength(2);
		expect(t.segments[1].departureStation).toBe('GBZZZ');
		expect(t.segments[1].arrivalStation).toBe('FRAAA');
		expect(t.segments[1].trainNumber).toBe('8888');
		expect(t.segments[1].seat).toBe('21');
		expect(t.seal).toBeNull();
	});

	it('tells an issuer seal apart from a second segment in the same space', () => {
		// The long form has no second leg: what follows the first segment is an
		// alphabetic block, and only a real segment has a train number in it.
		const blob = 'ABCDEFGHIJ'.repeat(8);
		expect(blob.length).toBe(80);

		const long = parseElb(buildElb({ seal: blob, length: 165 }));
		expect(long.segments).toHaveLength(1);
		expect(long.seal).toBe(blob);

		// the 120 and 121 character forms pad with blanks instead
		expect(parseElb(buildElb({ length: 121 })).seal).toBeNull();
		expect(parseElb(buildElb({ length: 120 })).seal).toBeNull();
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isElb(buildElb())).toBe(true);

		// wrong ID format
		expect(isElb(buildElb({ idFormat: 'x' }))).toBe(false);
		// letters where the ticket number belongs
		expect(isElb(buildElb({ ticketNumber: 'ABCDEFGHI' }))).toBe(false);
		// digits where the station mnemonics belong
		expect(isElb(buildElb({ segment1: { departure: '12345' } }))).toBe(false);
		// letters where the train number belongs
		expect(isElb(buildElb({ segment1: { train: 'ABCDE ' } }))).toBe(false);
		// truncated inside the first segment
		expect(isElb(ascii(new TextDecoder().decode(buildElb()).slice(0, 84)))).toBe(false);
		// not printable ASCII
		expect(isElb(new Uint8Array(120))).toBe(false);
	});

	it('does not swallow other printable-ASCII formats', () => {
		const tcdd = ascii(['TCDD_B', '6', '3', '0'].join('$').padEnd(120, '$'));
		expect(isElb(tcdd)).toBe(false);
	});

	it('builds segments the size B.12 gives them', () => {
		// 85 for one segment and 121 for two, which is what pins the offsets
		expect(elbSegment().length).toBe(36);
		expect(49 + 36).toBe(85);
		expect(49 + 2 * 36).toBe(121);
	});
});

describe('date helpers', () => {
	it('expands a year digit into the most recent matching year', () => {
		expect(lastDigitYear(4, NOW)).toBe(2024);
		expect(lastDigitYear(6, NOW)).toBe(2026);
	});

	it('never dates an issue in the future, since nothing is issued there', () => {
		// NOW is 2026, so a 7 is 2017 rather than next year
		expect(lastDigitYear(7, NOW)).toBe(2017);
		expect(lastDigitYear(8, NOW)).toBe(2018);
		expect(lastDigitYear(9, NOW)).toBe(2019);
	});

	it('turns a day of the year into a date, 1 January being day 1', () => {
		expect(dayOfYearDate(2024, 1)).toBe('2024-01-01');
		expect(dayOfYearDate(2024, 266)).toBe('2024-09-22');
		expect(dayOfYearDate(2024, 366)).toBe('2024-12-31');
	});

	it('refuses a day the year does not have, rather than rolling over', () => {
		expect(dayOfYearDate(2025, 366)).toBeNull();
		expect(dayOfYearDate(2024, 0)).toBeNull();
		expect(dayOfYearDate(2024, 367)).toBeNull();
	});
});
