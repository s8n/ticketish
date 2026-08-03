// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * UK RSP6. The ticket data lives inside an RSA signature with message
 * recovery, so the test signs a payload of its own with a throwaway key and
 * hands the parser the matching public key. No real ticket is involved.
 */
import { describe, expect, it } from 'vitest';
import { parseRsp6, isRsp6, type Rsp6TicketData } from '../src/lib/tickets/rsp/rsp6.ts';
import { buildRsp6, rsp6TicketBody, type Rsp6Fields } from './helpers/rsp6.ts';

const FIELDS: Rsp6Fields = {
	ticketReference: 'TESTREF01',
	standardClass: true,
	lennonTicketType: 'SDS',
	fareLabel: 'ABC',
	originNlc: '1234',
	destinationNlc: '5678',
	sellingNlc: '9012',
	childTicket: false,
	couponType: 0,
	discountCode: 11,
	routeCode: 222,
	// 1997-01-01 plus 10000 days is 2024-05-19
	startDay: 10000,
	startMinutes: 9 * 60 + 45,
	specVersion: 1
};

describe('RSP6 tickets', () => {
	const built = buildRsp6(rsp6TicketBody(FIELDS));

	it('recognises the barcode shape', () => {
		expect(isRsp6(built.barcode)).toBe(true);
	});

	it('recovers the payload and reads the ticket fields', () => {
		const ticket = parseRsp6(built.barcode, built.keys);
		expect(ticket.error).toBeUndefined();
		expect(ticket.keyRecovered).toBe(true);
		expect(ticket.ticketType).toBe('06');
		expect(ticket.ticketRef).toBe(built.ticketRef);
		expect(ticket.issuerId).toBe(built.issuerId);

		const d = ticket.data as Rsp6TicketData;
		expect(d.kind).toBe('ticket');
		expect(d.ticketReference).toBe(FIELDS.ticketReference);
		expect(d.standardClass).toBe(true);
		expect(d.lennonTicketType).toBe(FIELDS.lennonTicketType);
		expect(d.fareLabel).toBe(FIELDS.fareLabel);
		expect(d.originNlc).toBe(FIELDS.originNlc);
		expect(d.destinationNlc).toBe(FIELDS.destinationNlc);
		expect(d.sellingNlc).toBe(FIELDS.sellingNlc);
		expect(d.couponType).toBe('single');
		expect(d.discountCode).toBe(FIELDS.discountCode);
		expect(d.routeCode).toBe(FIELDS.routeCode);
		expect(d.startDate).toBe('2024-05-19T09:45');
		expect(d.specVersion).toBe(FIELDS.specVersion);
		expect(d.purchase).toBeNull();
	});

	it('reports an unknown issuer instead of throwing', () => {
		const ticket = parseRsp6(built.barcode, {});
		expect(ticket.keyRecovered).toBe(false);
		expect(ticket.error).toMatch(/no published key/);
		expect(ticket.ticketRef).toBe(built.ticketRef);
	});

	it('reports failure when no key matches the signature', () => {
		const other = buildRsp6(rsp6TicketBody(FIELDS), { issuerId: 'ZZ' });
		// right issuer id, wrong key material
		const ticket = parseRsp6(built.barcode, other.keys);
		expect(ticket.keyRecovered).toBe(false);
		expect(ticket.error).toMatch(/recovery failed/);
	});
});
