// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** TCDD e-tickets as passes, from the synthetic records in helpers/tcdd.ts. */
import { describe, expect, it } from 'vitest';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { ascii } from './helpers/build.ts';
import { tcddClassic, tcddModern } from './helpers/tcdd.ts';

const ticket = (fields: string[]) => makeTicket(ascii(fields.join('$')), { kind: 'raw' });

describe('a TCDD ticket', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'tcdd' } as never)).toBe(true);
	});

	it('names the newer layout stations from the table', async () => {
		const trip = (await tripFor(ticket(tcddModern)))!;
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe('TCDD Taşımacılık');
		expect(trip.from).toBe('ARİFİYE');
		expect(trip.to).toBe('KIRKAĞAÇ');
		expect(trip.train).toBe('54321');
		expect(trip.seat).toBe('21');
		// the newer layout zeroes a time it does not give, so the date stands alone
		expect(trip.departure).toBe('2024-05-19');
		expect(trip.reference).toBe('24TESTPN');
		expect(trip.price).toBe('999.0 TRY');
	});

	it('carries the older layout with its time, coach and full fare', async () => {
		const trip = (await tripFor(ticket(tcddClassic)))!;
		expect(trip.departure).toBe('2024-05-19T10:30');
		expect(trip.train).toBe('12345');
		expect(trip.coach).toBe('7');
		expect(trip.seat).toBe('12b');
		expect(trip.ticketId).toBe('240010TESTTKT1');
		// a retired id with no known name is shown by number
		expect(trip.from).toBe('Station 111111111');
		expect(previewFields(trip)).toContainEqual({ label: 'Full fare', value: '200.00 TRY' });
	});
});
