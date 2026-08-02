/**
 * Renfe barcodes. Field offsets were derived by mapping a real ticket against
 * its printed contents; the fixtures pin that mapping.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const CASES = ['es-renfe-aztec', 'es-renfe-qr'].map((name) => ({
	name,
	bin: fileURLToPath(new URL(`./fixtures/private/${name}.bin`, import.meta.url)),
	expected: fileURLToPath(new URL(`./fixtures/private/${name}.expected.json`, import.meta.url))
}));

describe.skipIf(!CASES.every((c) => existsSync(c.bin)))('Renfe tickets', () => {
	it.each(CASES)('parses $name', ({ bin, expected }) => {
		const exp = JSON.parse(readFileSync(expected, 'utf8'));
		const container = parsePayload(new Uint8Array(readFileSync(bin)));
		expect(container.kind).toBe('renfe');
		if (container.kind !== 'renfe') return;
		const t = container.ticket;
		expect(t.variant).toBe(exp.variant);
		expect(t.ticketNumber).toBe(exp.ticket.ticket_number);
		expect(t.trainNumber).toBe(exp.ticket.train_number);
		expect(t.departureDate).toBe(exp.ticket.departure_date);
		expect(t.coach).toBe(exp.ticket.coach);
		expect(t.seat).toBe(exp.ticket.seat);
		expect(t.bookingReference).toBe(exp.ticket.booking_reference);
		expect(t.verificationCode).toBe(exp.ticket.verification_code);
		if (exp.variant === 'aztec') {
			expect(t.departureTime).toBe(exp.ticket.departure_time);
			expect(t.originCode).toBe(exp.ticket.origin_code);
			expect(t.destinationCode).toBe(exp.ticket.destination_code);
			expect(t.companyCode).toBe(exp.ticket.company_code);
			expect(t.signature).toMatch(/^MC/);
		}
	});

	it('is not mistaken for an SSB barcode', async () => {
		const { isSsb } = await import('../src/lib/tickets/ssb/ssb.ts');
		const data = new Uint8Array(readFileSync(CASES[0].bin));
		// the first byte is ASCII '7', whose high nibble reads as SSB version 3
		expect((data[0] >> 4) & 0x0f).toBe(3);
		expect(isSsb(data)).toBe(false);
	});

	it('still detects real SSB payloads', async () => {
		const { isSsb } = await import('../src/lib/tickets/ssb/ssb.ts');
		const keycard = fileURLToPath(new URL('./fixtures/private/nl-ns-keycard.bin', import.meta.url));
		if (!existsSync(keycard)) return;
		expect(isSsb(new Uint8Array(readFileSync(keycard)))).toBe(true);
	});
});
