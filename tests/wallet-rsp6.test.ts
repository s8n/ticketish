// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * UK RSP6 tickets as passes. The payloads are built by the RSP6 test helper
 * and signed with a throwaway key, the way the parser's own tests do it.
 */
import { describe, expect, it } from 'vitest';
import { parseRsp6 } from '../src/lib/tickets/rsp/rsp6.ts';
import { loadNlcNames, nlcLabel } from '../src/lib/tickets/rsp/nlc.ts';
import type { ParsedTicket } from '../src/lib/tickets/types.ts';
import { hasMapping, previewFields, tripFor } from '../src/lib/wallet/trip.ts';
import { buildRsp6, rsp6TicketBody, type Rsp6Fields } from './helpers/rsp6.ts';

const FIELDS: Rsp6Fields = {
	ticketReference: 'TESTREF01',
	standardClass: true,
	lennonTicketType: 'SDS',
	fareLabel: 'ABC',
	originNlc: '1072',
	destinationNlc: '5268',
	sellingNlc: '9012',
	childTicket: false,
	couponType: 0,
	discountCode: 0,
	routeCode: 0,
	// 1997-01-01 plus 10000 days is 2024-05-19
	startDay: 10000,
	startMinutes: 9 * 60 + 45,
	specVersion: 1
};

function ticket(fields: Partial<Rsp6Fields> = {}): ParsedTicket {
	const built = buildRsp6(rsp6TicketBody({ ...FIELDS, ...fields }));
	return {
		id: 'test',
		source: { kind: 'raw' },
		raw: built.barcode,
		container: { kind: 'rsp6', ticket: parseRsp6(built.barcode, built.keys) },
		scannedAt: 0
	};
}

describe('an RSP6 ticket', () => {
	it('has a mapping', () => {
		expect(hasMapping({ kind: 'rsp6' } as never)).toBe(true);
	});

	it('is a journey between the two NLC stations, named from the table', async () => {
		const trip = (await tripFor(ticket()))!;
		const names = await loadNlcNames();
		expect(trip.shape).toBe('journey');
		expect(trip.issuer).toBe('National Rail');
		expect(trip.from).toBe(nlcLabel(names, '1072'));
		expect(trip.to).toBe(nlcLabel(names, '5268'));
		expect(trip.product).toBe('Single');
		expect(trip.travelClass).toBe('Standard');
		expect(trip.ticketId).toBeTruthy();
	});

	it('keeps only the date when the time binds nobody to anything', async () => {
		const trip = (await tripFor(ticket()))!;
		expect(trip.departure).toBeUndefined();
		expect(trip.validFrom).toBe('2024-05-19');
	});

	it('reads a specific departure as the departure', async () => {
		const trip = (await tripFor(ticket({ departTimeFlag: 2 })))!;
		expect(trip.departure).toBe('2024-05-19T09:45');
		expect(trip.validFrom).toBeUndefined();
	});

	it('reads "valid after" as the start of the validity, time and all', async () => {
		const trip = (await tripFor(ticket({ departTimeFlag: 1 })))!;
		expect(trip.validFrom).toBe('2024-05-19T09:45');
		expect(trip.departure).toBeUndefined();
	});

	it('puts a suggested departure on the back as a suggestion', async () => {
		const trip = (await tripFor(ticket({ departTimeFlag: 3 })))!;
		expect(trip.departure).toBeUndefined();
		expect(previewFields(trip)).toContainEqual({ label: 'Suggested departure', value: '09:45' });
	});

	it('shows first class and a child fare for what they are', async () => {
		const trip = (await tripFor(ticket({ standardClass: false, childTicket: true, couponType: 2 })))!;
		expect(trip.travelClass).toBe('First');
		expect(trip.product).toBe('Return, outbound');
		expect(previewFields(trip)).toContainEqual({ label: 'Passenger', value: 'child' });
	});

	it('offers no pass when the payload could not be recovered', async () => {
		const built = buildRsp6(rsp6TicketBody(FIELDS));
		const other = buildRsp6(rsp6TicketBody(FIELDS), { issuerId: 'ZZ' });
		const unrecovered: ParsedTicket = {
			id: 'test',
			source: { kind: 'raw' },
			raw: built.barcode,
			container: { kind: 'rsp6', ticket: parseRsp6(built.barcode, other.keys) },
			scannedAt: 0
		};
		expect(await tripFor(unrecovered)).toBeNull();
	});
});
