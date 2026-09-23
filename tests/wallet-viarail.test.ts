// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** VIA Rail boarding passes as wallet passes, from helpers/viarail.ts. */
import { describe, expect, it } from 'vitest';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { buildViaRail } from './helpers/viarail.ts';

describe('a VIA Rail boarding pass', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'viarail' } as never)).toBe(true);
	});

	it('is a named passenger in a car and seat on a train at a time', async () => {
		const trip = (await tripFor(makeTicket(buildViaRail(), { kind: 'raw' })))!;
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe('VIA Rail Canada');
		// no table for VIA's codes, so the pass shows them as the ticket does
		expect(trip.from).toBe('AAAA');
		expect(trip.to).toBe('ZZZZ');
		expect(trip.departure).toBe('2024-06-02T16:07');
		expect(trip.startUtcOffset).toBeUndefined();
		expect(trip.train).toBe('VIA99');
		expect(trip.coach).toBe('1');
		expect(trip.seat).toBe('11B');
		expect(trip.passenger).toBe('TESTGIVEN TESTSURNAME');
		expect(trip.reference).toBe('K00XYZ');
		expect(trip.ticketId).toBe('1234567890123');
		expect(previewFields(trip)).toContainEqual({ label: 'VIA Préférence', value: 'P3' });
	});
});
