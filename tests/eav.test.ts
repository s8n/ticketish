/**
 * EAV / UNICO Campania: a plain text QR with one field per line. The payloads
 * are written by the test.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isEav, parseEav } from '../src/lib/tickets/eav/eav.ts';

const encode = (lines: string[]) => new TextEncoder().encode(lines.join('\n') + '\n');

const TICKET = [
	'DIFFERITO_EOD',
	'EAV',
	'2024-05-19T10:00',
	'2024-05-19T23:59',
	'TESTPNR123',
	'21',
	'11',
	'20',
	'0'.repeat(56),
	'2024-05-19T10:00:42+02:00'
];

describe('EAV tickets', () => {
	it('recognises the payload', () => {
		expect(isEav(encode(TICKET))).toBe(true);
	});

	it('parses the labelled fields', () => {
		const t = parseEav(encode(TICKET));
		expect(t.ticketType).toBe('DIFFERITO_EOD');
		expect(t.operator).toBe('EAV');
		expect(t.validFrom).toBe('2024-05-19T10:00');
		expect(t.validUntil).toBe('2024-05-19T23:59');
		expect(t.pnr).toBe('TESTPNR123');
		expect(t.soldAt).toBe('2024-05-19T10:00:42+02:00');
		expect(t.authentication).toBe('0'.repeat(56));
	});

	it('keeps the unexplained numbers rather than guessing at them', () => {
		const t = parseEav(encode(TICKET));
		expect(t.codes).toEqual(['21', '11', '20']);
	});

	it('tolerates a payload with no trailing newline', () => {
		const withoutNewline = new TextEncoder().encode(TICKET.join('\n'));
		expect(isEav(withoutNewline)).toBe(true);
		expect(parseEav(withoutNewline).pnr).toBe('TESTPNR123');
	});

	it('is reached through the format dispatcher', () => {
		const c = parsePayload(encode(TICKET));
		expect(c.kind).toBe('eav');
		if (c.kind !== 'eav') return;
		expect(c.ticket.pnr).toBe('TESTPNR123');
	});

	it('does not claim other plain text barcodes', () => {
		expect(isEav(new TextEncoder().encode('Ticket Number: 12345\nProduct: Seat\n'))).toBe(false);
		// same shape but another operator
		expect(isEav(encode(['X', 'NOTEAV', ...TICKET.slice(2)]))).toBe(false);
		expect(parsePayload(new TextEncoder().encode('just text')).kind).toBe('text');
	});
});
