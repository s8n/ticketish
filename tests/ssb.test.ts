/** SSB (NS Keycard) parsing against Python-generated ground truth. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const BIN = fileURLToPath(new URL('./fixtures/private/nl-ns-keycard.bin', import.meta.url));
const EXPECTED = fileURLToPath(new URL('./fixtures/private/nl-ns-keycard.expected.json', import.meta.url));

describe.skipIf(!existsSync(BIN))('SSB NS Keycard', () => {
	it('parses envelope and keycard record', () => {
		const exp = JSON.parse(readFileSync(EXPECTED, 'utf8'));
		const container = parsePayload(new Uint8Array(readFileSync(BIN)));
		expect(container.kind).toBe('ssb');
		if (container.kind !== 'ssb') return;
		const e = container.envelope;
		expect(e.version).toBe(exp.envelope.version);
		expect(e.issuerRics).toBe(exp.envelope.issuer_rics);
		expect(e.keyId).toBe(exp.envelope.key_id);
		expect(e.ticketType).toBe(exp.envelope.ticket_type);

		const k = e.data;
		expect(k).not.toBeNull();
		if (!k) return;
		expect(k.cardId).toBe(exp.keycard.card_id);
		expect(k.numAdults).toBe(exp.keycard.num_adults);
		expect(k.numChildren).toBe(exp.keycard.num_children);
		expect(k.specimen).toBe(exp.keycard.specimen);
		expect(k.travelClass).toBe(exp.keycard.travel_class);
		expect(k.productCode).toBe(exp.keycard.product_code);
		expect(k.issuingDate).toBe(exp.keycard.issuing_date);
		expect(k.validityStart).toBe(exp.keycard.validity_start);
		expect(k.validityEnd).toBe(exp.keycard.validity_end);
		expect(k.extraText).toBe(exp.keycard.extra_text);
		expect(k.stationUic).toBe(exp.keycard.station_uic);
	});

	it('resolves the year digit against a fixed reference date', async () => {
		const { parseSsb } = await import('../src/lib/tickets/ssb/ssb.ts');
		const data = new Uint8Array(readFileSync(BIN));
		// the sample was issued in 2017; with a 2026 reference it must not
		// resolve into the future
		const e = parseSsb(data, new Date('2026-08-03T00:00:00Z'));
		expect(e.data?.issuingDate.startsWith('201')).toBe(true);
	});
});
