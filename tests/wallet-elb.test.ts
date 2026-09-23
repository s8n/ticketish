// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** ELB tickets as passes, built by the ELB test helper from invented values. */
import { describe, expect, it } from 'vitest';
import { parseElb } from '../src/lib/tickets/elb/elb.ts';
import type { ParsedTicket } from '../src/lib/tickets/types.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { buildElb, type ElbParts } from './helpers/elb.ts';

/** Fixed so the single year digit resolves the same way on every run. */
const NOW = new Date('2026-08-03T00:00:00Z');

function ticket(parts: ElbParts = {}): ParsedTicket {
	const raw = buildElb(parts);
	return {
		id: 'test',
		source: { kind: 'raw' },
		raw,
		container: { kind: 'elb', ticket: parseElb(raw, NOW) },
		scannedAt: 0
	};
}

describe('an ELB ticket', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'elb' } as never)).toBe(true);
	});

	it('is a journey named from the Benerail table, dated but not timed', async () => {
		const trip = (await tripFor(ticket({ segment1: { departure: 'FRPNO', arrival: 'GBSPX' } })))!;
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe('Eurostar');
		expect(trip.from).toBe('Paris Gare du Nord');
		expect(trip.to).toBe('London St Pancras International');
		// day 266 of 2024, with no time in the record
		expect(trip.departure).toBe('2024-09-22');
		expect(trip.train).toBe('9999');
		expect(trip.coach).toBe('3');
		expect(trip.seat).toBe('7');
		expect(trip.travelClass).toBe('2nd class');
		expect(trip.ticketId).toBe('IV123456789');
		expect(trip.reference).toBe('TESTPN');
	});

	it('shows a mnemonic the table does not know as the mnemonic', async () => {
		const trip = (await tripFor(ticket()))!;
		expect(trip.from).toBe('FRAAA');
		expect(trip.to).toBe('GBZZZ');
	});

	it('names the issuer from the ticket code', async () => {
		expect((await tripFor(ticket({ ticketCode: 'DV' })))!.issuer).toBe('SNCF');
	});

	it('puts the return leg on the back in one line', async () => {
		const trip = (await tripFor(
			ticket({ segment2: { departure: 'GBSPX', arrival: 'FRPNO', train: '09000 ', departureDay: '270' } })
		))!;
		const back = previewFields(trip).find((f) => f.label === 'Return')!;
		expect(back.value).toContain('London St Pancras International to Paris Gare du Nord');
		expect(back.value).toContain('train 9000');
	});

	it('says so when the record is a specimen', async () => {
		const trip = (await tripFor(ticket({ specimen: '0' })))!;
		expect(previewFields(trip).map((f) => f.label)).toContain('Specimen');
	});
});
