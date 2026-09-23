// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** HŽPP tickets as passes, built by helpers/hzpp.ts from invented values. */
import { describe, expect, it } from 'vitest';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { latin1 } from './helpers/build.ts';
import { buildHzpp, type HzppParts } from './helpers/hzpp.ts';

const ticket = (parts: HzppParts = {}) => makeTicket(buildHzpp(parts), { kind: 'raw' });

describe('an HŽPP ticket', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'hzpp' } as never)).toBe(true);
	});

	it('is a journey between UIC stations, valid in Zagreb local time', async () => {
		const trip = (await tripFor(ticket()))!;
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe('HŽPP');
		expect(trip.from).toBe('Zagreb');
		expect(trip.to).toBe('Split');
		// 08:00 UTC in June is 10:00 in Zagreb, at UTC+2
		expect(trip.validFrom).toBe('2024-06-01T10:00');
		expect(trip.validUntil).toBe('2024-06-02T10:00');
		expect(trip.startUtcOffset).toBe(120);
		expect(trip.endUtcOffset).toBe(120);
		expect(trip.price).toBe('14.99 EUR');
		expect(trip.ticketId).toBe('TEST0000001');
		expect(trip.departure).toBeUndefined();
	});

	it('takes the first train and seat, and lists the trains on the back when there are more', async () => {
		const trip = (await tripFor(ticket({ outTrains: [123, 'R1', '21', 456, 'R2', '33'] })))!;
		expect(trip.train).toBe('123');
		expect(trip.seat).toBe('21');
		expect(previewFields(trip)).toContainEqual({
			label: 'Trains',
			value: 'train 123, seat 21; train 456, seat 33'
		});
	});

	it('puts the return leg on the back', async () => {
		const trip = (await tripFor(ticket({ ret: [76660, 72480, 0, 2, 100] })))!;
		const back = previewFields(trip).find((f) => f.label === 'Return')!;
		expect(back.value).toContain('Split to Zagreb');
	});

	it('offers no pass for the encrypted form, which cannot be read', async () => {
		const sealed = makeTicket(latin1('A1' + 'ab'.repeat(39 * 16) + 'cd'.repeat(16)), { kind: 'raw' });
		expect(sealed.container.kind).toBe('hzpp');
		expect(await tripFor(sealed)).toBeNull();
	});
});
