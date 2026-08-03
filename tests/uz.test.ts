// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Ukrainian Railways boarding documents, a line per field.
 *
 * The `build` helper lays out the lines in the order a real ticket has them,
 * from invented values. Nothing here is copied off one.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isUz, parseUz } from '../src/lib/tickets/uz/uz.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

interface Parts {
	train?: string;
	from?: string;
	to?: string;
	departure?: string;
	arrival?: string;
	coach?: string;
	seat?: string;
	passenger?: string;
	price?: string;
	document?: string;
	authentication?: string;
	trailing?: string[];
}

function build(parts: Parts = {}): Uint8Array {
	const p = {
		train: '111 ТЕСТ ПОЇЗД',
		from: '(1000001) ТЕСТ-ПЕРШИЙ',
		to: '(1000002) ТЕСТ-ДРУГИЙ',
		departure: '02.03 08:05',
		arrival: '02.03 12:45',
		coach: '07 Т/2 КЛ',
		seat: '021 Повний',
		passenger: 'TEST PASSENGER',
		price: '123.45',
		document: '00000001-0000ABCD-0002',
		authentication: '0123456789ABCDEF0123456789ABCDEF',
		trailing: [] as string[],
		...parts
	};

	return utf8(
		[
			'',
			p.train,
			p.from,
			p.to,
			p.departure,
			p.arrival,
			p.coach,
			p.seat,
			'..........',
			p.passenger,
			...p.trailing,
			'',
			p.price,
			' ',
			'',
			p.document,
			'',
			p.authentication,
			''
		].join('\n')
	);
}

describe('UZ boarding documents', () => {
	it('reads the fields the ticket also prints', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('uz');
		if (c.kind !== 'uz') return;

		expect(c.ticket.train).toBe('111 ТЕСТ ПОЇЗД');
		expect(c.ticket.from).toEqual({ code: '1000001', name: 'ТЕСТ-ПЕРШИЙ' });
		expect(c.ticket.to).toEqual({ code: '1000002', name: 'ТЕСТ-ДРУГИЙ' });
		expect(c.ticket.coach).toBe('07');
		expect(c.ticket.coachClass).toBe('Т/2 КЛ');
		expect(c.ticket.seat).toBe('021');
		expect(c.ticket.fareType).toBe('Повний');
		expect(c.ticket.passenger).toBe('TEST PASSENGER');
		expect(c.ticket.documentNumber).toBe('00000001-0000ABCD-0002');
		expect(c.ticket.authentication).toBe('0123456789ABCDEF0123456789ABCDEF');
	});

	it('reads both times as a day and month, since there is no year', () => {
		const t = parseUz(build({ departure: '02.03 08:05', arrival: '02.03 12:45' }));
		expect(t.departure).toEqual({ day: 2, month: 3, time: '08:05' });
		expect(t.arrival).toEqual({ day: 2, month: 3, time: '12:45' });
	});

	it('rejects a time that is not one rather than showing it', () => {
		// a day of 45 or an hour of 99 is not a departure
		const t = parseUz(build({ departure: '45.03 08:05', arrival: '02.13 99:05' }));
		expect(t.departure).toBeNull();
		expect(t.arrival).toBeNull();
	});

	it('keeps the fare in kopiykas, the way the other formats keep minor units', () => {
		expect(parseUz(build({ price: '854.72' })).price).toBe(85472);
		expect(parseUz(build({ price: '9.00' })).price).toBe(900);
	});

	it('finds its fields by shape, not by counting lines from the top', () => {
		// a ticket with extra lines in the middle still parses, which is the
		// point: one sample is not enough to trust a fixed line index
		const t = parseUz(build({ trailing: ['МПС', '691000', 'СЛУЖБОВИЙ'] }));
		expect(t.from?.code).toBe('1000001');
		expect(t.seat).toBe('021');
		expect(t.passenger).toBe('TEST PASSENGER');
		// whatever it could not place is kept rather than dropped
		expect(t.extra).toEqual(['МПС', '691000', 'СЛУЖБОВИЙ']);
	});

	it('drops the blank lines and the row of dots', () => {
		const t = parseUz(build());
		expect(t.extra).toEqual([]);
	});

	it('needs both stations and a time before it claims a payload', () => {
		expect(isUz(build())).toBe(true);

		// one station is not enough
		expect(isUz(utf8('111 ТЕСТ\n(1000001) ТЕСТ\n02.03 08:05'))).toBe(false);
		// nor are two stations with no time
		expect(isUz(utf8('(1000001) A\n(1000002) B'))).toBe(false);
		// station codes are seven digits
		expect(isUz(utf8('(100001) A\n(100002) B\n02.03 08:05'))).toBe(false);
		expect(isUz(new Uint8Array(0))).toBe(false);
	});

	it('does not swallow the other line-based text formats', () => {
		// EAV is also plain text, one field per line, but has no station lines
		const eav = utf8(
			['DIFFERITO_EOD', 'EAV', '2024-05-19T10:00', '2024-05-19T23:59', 'ABCDEFGH12'].join('\n')
		);
		expect(isUz(eav)).toBe(false);
	});

	it('leaves a payload that is not text alone', () => {
		expect(isUz(new Uint8Array([0xff, 0xfe, 0x00, 0x01]))).toBe(false);
	});
});
