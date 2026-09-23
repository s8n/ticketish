// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** SSB1 tickets as passes, built by helpers/ssb1.ts from invented values. */
import { describe, expect, it } from 'vitest';
import { parseSsb1 } from '../src/lib/tickets/ssb/ssb1.ts';
import { loadIssuerNames, ricsName } from '../src/lib/tickets/uic/rics.ts';
import type { ParsedTicket } from '../src/lib/tickets/types.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { buildSsb1 } from './helpers/ssb1.ts';

/** Fixed, since the days carry no year and resolve against the date. */
const REFERENCE = new Date('2026-05-01T00:00:00Z');

function ticket(parts: Parameters<typeof buildSsb1>[0] = {}): ParsedTicket {
	const raw = buildSsb1(parts);
	return {
		id: 'test',
		source: { kind: 'raw' },
		raw,
		container: { kind: 'ssb1', ticket: parseSsb1(raw, REFERENCE) },
		scannedAt: 0
	};
}

describe('an SSB1 ticket', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'ssb1' } as never)).toBe(true);
	});

	it('is a journey on a train, dated by the day and issued under its RICS code', async () => {
		const trip = (await tripFor(ticket()))!;
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe(ricsName(10, await loadIssuerNames()) ?? 'RICS 10');
		expect(trip.operator).toEqual({ scheme: 'rics', code: 10 });
		expect(trip.from).toBe('AAA');
		expect(trip.to).toBe('BBB');
		// day 106 of 2026, read in May
		expect(trip.departure).toBe('2026-04-16');
		expect(trip.train).toBe('42');
		expect(trip.coach).toBe('2');
		expect(trip.seat).toBe('24');
		expect(trip.travelClass).toBe('2nd class');
	});

	it('puts the half hour slot on the back rather than claiming a time', async () => {
		const trip = (await tripFor(ticket()))!;
		expect(trip.departure).not.toContain('T');
		expect(previewFields(trip)).toContainEqual({ label: 'Departs', value: 'between 14:00 and 14:29' });
	});

	it('names a station given as a UIC code from the table', async () => {
		const trip = (await tripFor(ticket({ departureUic: 1000001 })))!;
		expect(trip.from).toBe('Helsinki asema');
	});

	it('is a validity window rather than a departure without a train', async () => {
		const trip = (await tripFor(ticket({ train: 0, validUntilDay: 110 })))!;
		expect(trip.departure).toBeUndefined();
		expect(trip.validFrom).toBe('2026-04-16');
		expect(trip.validUntil).toBe('2026-04-20');
	});
});
