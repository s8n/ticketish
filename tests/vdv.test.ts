/** VDV-KA parsing against Python-generated ground truth (private fixtures). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const CASES = ['de-mvg-dticket', 'de-mvg-airportplus'].map((name) => ({
	name,
	bin: fileURLToPath(new URL(`./fixtures/private/${name}.bin`, import.meta.url)),
	expected: fileURLToPath(new URL(`./fixtures/private/${name}.expected.json`, import.meta.url))
}));

describe.skipIf(!CASES.every((c) => existsSync(c.bin)))('VDV tickets', () => {
	it.each(CASES)('recovers and parses $name', ({ bin, expected }) => {
		const exp = JSON.parse(readFileSync(expected, 'utf8'));
		const container = parsePayload(new Uint8Array(readFileSync(bin)));
		expect(container.kind).toBe('vdv');
		if (container.kind !== 'vdv') return;
		const b = container.barcode;
		expect(b.error).toBeUndefined();
		expect(b.recovered).toBe(true);
		expect(b.container).toBe(exp.container);
		if (exp.container_identifier) expect(b.containerIdentifier).toBe(exp.container_identifier);
		expect(b.caReference).toBe(exp.ca_reference);
		expect(b.certificateHolder).toBe(exp.certificate_holder);
		expect(b.payloadHex).toBe(exp.payload_hex);

		expect(b.tickets).toHaveLength(1);
		const t = b.tickets[0];
		expect(t.version).toBe(exp.ticket.version);
		expect(t.ticketId).toBe(exp.ticket.ticket_id);
		expect(t.ticketOrgId).toBe(exp.ticket.ticket_org_id);
		expect(t.productNumber).toBe(exp.ticket.product_number);
		expect(t.productOrgId).toBe(exp.ticket.product_org_id);
		expect(t.validityStart).toBe(exp.ticket.validity_start);
		expect(t.validityEnd).toBe(exp.ticket.validity_end);
	});

	it('reports an unknown CA instead of throwing', async () => {
		const { parseVdv } = await import('../src/lib/tickets/vdv/vdv.ts');
		const bin = new Uint8Array(readFileSync(CASES[0].bin));
		// corrupt the CA reference generation year so no key matches
		const copy = bin.slice();
		const idx = copy.length - 1;
		copy[idx] = 0x99;
		const result = parseVdv(copy);
		expect(result.recovered).toBe(false);
		expect(result.error).toBeTruthy();
	});
});
