/**
 * VDV-KA. The ticket is recovered out of an ISO 9796-2 signature, and the
 * issuer key out of a CV certificate signed by a CA, so the test builds that
 * whole chain with throwaway keys. No real ticket is involved.
 */
import { describe, expect, it } from 'vitest';
import { parseVdv, isVdv } from '../src/lib/tickets/vdv/vdv.ts';
import { tlv, concat } from './helpers/build.ts';
import { buildVdv, vdvHeader, vdvDateTime, wrapMotics } from './helpers/vdv.ts';

const HEADER = vdvHeader({
	ticketId: 12345678,
	ticketOrgId: 77,
	productNumber: 9999,
	productOrgId: 6292,
	validFrom: vdvDateTime(2024, 5, 1, 0, 0),
	validUntil: vdvDateTime(2024, 6, 1, 3, 0)
});

/** Basic data element: payment type, price and VAT. */
const BASIC_DATA = (() => {
	const d = new Uint8Array(17);
	d[0] = 6; // EC-Karte / Lastschrift
	d[7] = 2; // second class
	d[8] = 0x00;
	d[9] = 0x13;
	d[10] = 0x22; // price base 49.—
	d[12] = 7; // VAT rate
	return d;
})();

describe('VDV tickets', () => {
	const built = buildVdv({ header: HEADER, productData: tlv(0xda, BASIC_DATA) });

	it('recognises the envelope', () => {
		expect(isVdv(built.barcode)).toBe(true);
	});

	it('walks the certificate chain and reads the ticket', () => {
		const result = parseVdv(built.barcode, built.caKeys);
		expect(result.error).toBeUndefined();
		expect(result.recovered).toBe(true);
		expect(result.container).toBe('plain');
		expect(result.caReference).toBe(built.caReference);
		expect(result.certificateHolder).toBe(built.holderName);

		expect(result.tickets).toHaveLength(1);
		const t = result.tickets[0];
		expect(t.ticketId).toBe(12345678);
		expect(t.ticketOrgId).toBe(77);
		expect(t.productNumber).toBe(9999);
		expect(t.productOrgId).toBe(6292);
		expect(t.validityStart).toBe('2024-05-01T00:00:00');
		expect(t.validityEnd).toBe('2024-06-01T03:00:00');
		expect(t.version).toBe('1.10.7');
	});

	it('decodes the basic data element', () => {
		const result = parseVdv(built.barcode, built.caKeys);
		const element = result.tickets[0].productData.find((e) => e.tag === 0xda);
		expect(element?.data).toMatchObject({
			paymentType: 'EC-Karte / Lastschrift',
			serviceClass: '2. Klasse',
			vatRate: 7
		});
	});

	it('reads the same ticket inside a MOTICS container', () => {
		const wrapped = wrapMotics(built.barcode);
		expect(isVdv(wrapped)).toBe(true);
		const result = parseVdv(wrapped, built.caKeys);
		expect(result.error).toBeUndefined();
		expect(result.container).toBe('motics');
		expect(result.containerIdentifier).toBe('G&D');
		expect(result.tickets[0].ticketId).toBe(12345678);
	});

	it('shows the identification medium as text inside a MOTICS container', () => {
		// the element's bytes are ASCII: a secure element identifier written out
		const identifier = 'T6230BFA983FE4F29821FE7C87C4FECA9';
		const element = tlv(0xd7, new Uint8Array([...identifier].map((c) => c.charCodeAt(0))));
		const withMedium = buildVdv({
			header: HEADER,
			productData: concat(tlv(0xda, BASIC_DATA), element)
		});

		const wrapped = parseVdv(wrapMotics(withMedium.barcode), withMedium.caKeys);
		const inMotics = wrapped.tickets[0].productData.find((e) => e.tag === 0xd7);
		expect(inMotics?.text).toBe(identifier);

		// outside a MOTICS container the same bytes stay as hex, since only
		// there is the value known to be text
		const plain = parseVdv(withMedium.barcode, withMedium.caKeys);
		const outside = plain.tickets[0].productData.find((e) => e.tag === 0xd7);
		expect(outside?.text).toBeUndefined();
		expect(outside?.hex).toBe(inMotics?.hex);
	});

	it('leaves a non-textual identification medium as hex', () => {
		const binary = tlv(0xd7, new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x01]));
		const built = buildVdv({ header: HEADER, productData: concat(tlv(0xda, BASIC_DATA), binary) });
		const result = parseVdv(wrapMotics(built.barcode), built.caKeys);
		expect(result.tickets[0].productData.find((e) => e.tag === 0xd7)?.text).toBeUndefined();
	});

	it('reports an unknown CA instead of throwing', () => {
		const result = parseVdv(built.barcode, {});
		expect(result.recovered).toBe(false);
		expect(result.error).toMatch(/no published CA key/);
	});

	it('reports a certificate it cannot recover', () => {
		const other = buildVdv({ header: HEADER, productData: tlv(0xda, BASIC_DATA) });
		// right CA reference, wrong key material
		const result = parseVdv(built.barcode, other.caKeys);
		expect(result.recovered).toBe(false);
		expect(result.error).toMatch(/recovery failed/);
	});

	it('handles multiple authorisations in one envelope', () => {
		// two tickets share the envelope; the parser must read both
		const single = buildVdv({ header: HEADER, productData: tlv(0xda, BASIC_DATA) });
		const items = [...splitTlv(single.barcode)];
		const signature = items.find((i) => i.tag === 0x9e)!;
		const remainder = items.find((i) => i.tag === 0x9a)!;
		const certificate = items.find((i) => i.tag === 0x7f21)!;
		const caReference = items.find((i) => i.tag === 0x42)!;

		const multi = concat(
			tlv(
				0xef,
				concat(
					tlv(0x90, new Uint8Array([2])),
					tlv(0x9e, signature.value),
					tlv(0x9a, remainder.value),
					tlv(0x9e, signature.value),
					tlv(0x9a, remainder.value)
				)
			),
			tlv(0x7f21, certificate.value),
			tlv(0x42, caReference.value)
		);

		const result = parseVdv(multi, single.caKeys);
		expect(result.error).toBeUndefined();
		expect(result.tickets).toHaveLength(2);
		expect(result.tickets[0].ticketId).toBe(result.tickets[1].ticketId);
	});
});

/** Minimal TLV split, only used to take an envelope apart again. */
function* splitTlv(data: Uint8Array) {
	let i = 0;
	while (i < data.length) {
		let tag = data[i++];
		if ((tag & 0x1f) === 0x1f) tag = (tag << 8) | data[i++];
		let length = data[i++];
		if (length & 0x80) {
			const n = length & 0x7f;
			length = 0;
			for (let k = 0; k < n; k++) length = (length << 8) | data[i++];
		}
		yield { tag, value: data.subarray(i, i + length) };
		i += length;
	}
}
