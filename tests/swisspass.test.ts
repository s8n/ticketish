/** SwissPass/NOVA protobuf parsing against python-protobuf ground truth. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const BIN = fileURLToPath(new URL('./fixtures/private/ch-ostwind.bin', import.meta.url));
const EXPECTED = fileURLToPath(new URL('./fixtures/private/ch-ostwind.expected.json', import.meta.url));

describe.skipIf(!existsSync(BIN))('SwissPass ticket', () => {
	it('decodes the protobuf and matches ground truth', () => {
		const exp = JSON.parse(readFileSync(EXPECTED, 'utf8')).ticket;
		const container = parsePayload(new Uint8Array(readFileSync(BIN)));
		expect(container.kind).toBe('swisspass');
		if (container.kind !== 'swisspass') return;
		const t = container.ticket;

		expect(t.keyMeta?.rics).toBe(exp.key_meta.rics);
		const data = t.ticketData as Record<string, any>;
		expect(String(data.ticketId)).toBe(exp.ticket_data.ticket_id);
		const tariff = data.tariff;
		const expTariff = exp.ticket_data.tariff;
		expect(tariff.product.name).toBe(expTariff.product.name);
		expect(tariff.travelClass.toLowerCase()).toBe(expTariff.travel_class.toLowerCase());
		expect(tariff.route).toEqual(expTariff.route);
		expect(tariff.validFrom).toBe(Number(expTariff.valid_from.msecs));
		expect(tariff.validUntil).toBe(Number(expTariff.valid_until.msecs));
		expect(tariff.zones.map((z: any) => z.zoneId)).toEqual(
			expTariff.zones.map((z: any) => z.zone_id)
		);
		const traveler = data.traveler;
		expect(traveler.surname).toBe(exp.ticket_data.traveler.surname);
		expect(traveler.forename).toBe(exp.ticket_data.traveler.forename);
		expect(data.payment.price).toBe(exp.ticket_data.payment.price);
		expect(data.payment.currency).toBe(exp.ticket_data.payment.currency);
		expect(data.sale.issuingOrg).toBe(exp.ticket_data.sale.issuing_org);
	});

	it('does not misclassify other payloads as SwissPass', () => {
		const muster = fileURLToPath(
			new URL('./fixtures/public/muster-918-9-fv-supersparpreis.bin', import.meta.url)
		);
		const container = parsePayload(new Uint8Array(readFileSync(muster)));
		expect(container.kind).toBe('uic9183');
	});
});
