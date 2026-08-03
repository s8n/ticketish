/**
 * VDV passenger element (tag 0xDB): a gender byte, a four byte BCD date of
 * birth, then the name in ISO-8859-15. The payload is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { parseVdv } from '../src/lib/tickets/vdv/vdv.ts';
import { tlv } from './helpers/build.ts';
import { buildVdv, vdvDateTime, vdvHeader } from './helpers/vdv.ts';

const HEADER = vdvHeader({
	ticketId: 1,
	ticketOrgId: 1,
	productNumber: 1,
	productOrgId: 6292,
	validFrom: vdvDateTime(2024, 5, 1, 0, 0),
	validUntil: vdvDateTime(2024, 5, 2, 0, 0)
});

/** gender, BCD year/month/day, then the abbreviated name. */
function passengerElement(gender: number, bcd: number[], name: string): Uint8Array {
	const text = [...name].map((c) => c.charCodeAt(0));
	return tlv(0xdb, new Uint8Array([gender, ...bcd, ...text]));
}

// each build generates its own throwaway keys, so build and parse together
function build(element: Uint8Array) {
	const built = buildVdv({ header: HEADER, productData: element });
	return parseVdv(built.barcode, built.caKeys);
}

const passengerOf = (result: ReturnType<typeof build>) =>
	result.tickets.flatMap((t) => t.productData).find((e) => e.passenger)?.passenger;

describe('VDV passenger data', () => {
	it('reads gender, date of birth and the abbreviated name', () => {
		// "E3a@M8n" is how a passenger called Erika Mustermann is stored
		const p = passengerOf(build(passengerElement(2, [0x19, 0x85, 0x03, 0x27], 'E3a@M8n')));
		expect(p).toBeDefined();
		expect(p?.gender).toBe('female');
		expect(p?.dateOfBirth).toBe('1985-03-27');
		expect(p?.forename).toBe('E___a');
		expect(p?.surname).toBe('M________n');
		expect(p?.abbreviated).toBe(true);
	});

	it('keeps a date of birth whose BCD year contains a zero byte', () => {
		// year 2000 encodes as "20 00"; treating any zero byte as "absent"
		// would silently drop dates like this one
		const p = passengerOf(build(passengerElement(1, [0x20, 0x00, 0x07, 0x04], 'A1b@C2d')));
		expect(p?.dateOfBirth).toBe('2000-07-04');
		expect(p?.gender).toBe('male');
	});

	it('leaves gender null when the byte is unset', () => {
		const p = passengerOf(build(passengerElement(0, [0x19, 0x99, 0x12, 0x31], 'X1y@Z1a')));
		expect(p?.gender).toBeNull();
		expect(p?.dateOfBirth).toBe('1999-12-31');
	});

	it('reports no date when the field is empty', () => {
		const p = passengerOf(build(passengerElement(2, [0, 0, 0, 0], 'E3a@M8n')));
		expect(p?.dateOfBirth).toBeNull();
	});

	it('handles plain names split with a hash', () => {
		const p = passengerOf(build(passengerElement(3, [0x19, 0x90, 0x01, 0x02], 'ERIKA#MUSTER')));
		expect(p?.abbreviated).toBe(false);
		expect(p?.forename).toBe('ERIKA');
		expect(p?.surname).toBe('MUSTER');
		expect(p?.gender).toBe('diverse');
	});

	it('handles non-ASCII letters, which are ISO-8859-15', () => {
		// 0xD6 is the German capital O with an umlaut in that encoding
		const element = tlv(
			0xdb,
			new Uint8Array([2, 0x19, 0x95, 0x06, 0x15, 0x45, 0x31, 0x61, 0x40, 0xd6, 0x32, 0x6c])
		);
		const p = passengerOf(build(element));
		expect(p?.forename).toBe('E_a');
		expect(p?.surname).toBe('Ö__l');
	});
});
