// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Renfe barcodes: fixed width printable ASCII, "~" padded, ending in a base64
 * signature. The payloads are built by the test.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isSsb } from '../src/lib/tickets/ssb/ssb.ts';
import { ascii, renfeAztec as aztec, renfeBlockB as blockB } from './helpers/renfe.ts';

describe('Renfe tickets', () => {
	it('parses the long Aztec form', () => {
		const c = parsePayload(aztec());
		expect(c.kind).toBe('renfe');
		if (c.kind !== 'renfe') return;
		expect(c.ticket.variant).toBe('aztec');
		expect(c.ticket.ticketNumber).toBe('7250000000001');
		expect(c.ticket.companyCode).toBe('1071');
		expect(c.ticket.trainNumber).toBe('3112');
		expect(c.ticket.departureDate).toBe('2024-05-19');
		expect(c.ticket.departureTime).toBe('11:00');
		expect(c.ticket.originCode).toBe('71801');
		expect(c.ticket.destinationCode).toBe('60000');
		expect(c.ticket.coach).toBe('18');
		expect(c.ticket.seat).toBe('15B');
		expect(c.ticket.bookingReference).toBe('TESTAB');
		expect(c.ticket.signature).toMatch(/^MC/);
	});

	it('parses the short QR form on its own', () => {
		const c = parsePayload(ascii(blockB()));
		expect(c.kind).toBe('renfe');
		if (c.kind !== 'renfe') return;
		expect(c.ticket.variant).toBe('qr');
		expect(c.ticket.trainNumber).toBe('3112');
		expect(c.ticket.departureDate).toBe('2024-05-19');
		expect(c.ticket.coach).toBe('18');
		expect(c.ticket.seat).toBe('15B');
		expect(c.ticket.bookingReference).toBe('TESTAB');
		// the short form carries no time or stations
		expect(c.ticket.departureTime).toBeUndefined();
		expect(c.ticket.originCode).toBeUndefined();
	});

	it('finds the signature after the zero padding, not inside it', () => {
		const c = parsePayload(aztec());
		if (c.kind !== 'renfe') return;
		// a naive search would start matching in the run of "0" padding
		expect(c.ticket.signature?.startsWith('MCwCFE')).toBe(true);
		expect(c.ticket.signature).toHaveLength(64);
	});

	it('is not mistaken for an SSB barcode', () => {
		const payload = aztec();
		// ASCII "7" has a high nibble of 3, which reads as an SSB version
		expect((payload[0] >> 4) & 0x0f).toBe(3);
		expect(isSsb(payload)).toBe(false);
	});
});
