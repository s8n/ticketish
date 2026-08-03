/**
 * VDV passenger element (tag 0xDB).
 *
 * Assertions here are deliberately structural rather than personal: the
 * fixtures are real tickets, so the tests check the shape of what was
 * decoded, not who the passenger is.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseVdv } from '../src/lib/tickets/vdv/vdv.ts';

const fixture = (name: string) =>
	fileURLToPath(new URL(`./fixtures/private/${name}.bin`, import.meta.url));

const NAMES = ['de-mvg-dticket', 'de-mvg-airportplus'];

const passengerOf = (name: string) => {
	const barcode = parseVdv(new Uint8Array(readFileSync(fixture(name))));
	return barcode.tickets.flatMap((t) => t.productData).find((el) => el.passenger)?.passenger;
};

describe.skipIf(!NAMES.every((n) => existsSync(fixture(n))))('VDV passenger data', () => {
	it.each(NAMES)('decodes the passenger element of %s', (name) => {
		const p = passengerOf(name);
		expect(p).toBeDefined();
		if (!p) return;

		// The name is stored abbreviated: first and last letter of each part
		// with the hidden ones counted, so it expands to letters plus filler.
		expect(p.abbreviated).toBe(true);
		expect(p.forename).toMatch(/^\p{L}_*\p{L}$/u);
		expect(p.surname).toMatch(/^\p{L}_*\p{L}$/u);

		// A four byte BCD date, which for a year like 2000 legitimately
		// contains a zero byte.
		expect(p.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		const [year, month, day] = p.dateOfBirth!.split('-').map(Number);
		expect(year).toBeGreaterThan(1900);
		expect(month).toBeGreaterThanOrEqual(1);
		expect(month).toBeLessThanOrEqual(12);
		expect(day).toBeGreaterThanOrEqual(1);
		expect(day).toBeLessThanOrEqual(31);
	});

	it('reads the gender byte when set and leaves it null when not', () => {
		const withGender = passengerOf('de-mvg-airportplus');
		const withoutGender = passengerOf('de-mvg-dticket');
		expect(['male', 'female', 'diverse']).toContain(withGender?.gender);
		expect(withoutGender?.gender).toBeNull();
		// both tickets belong to the same person, so the rest must agree
		expect(withoutGender?.dateOfBirth).toBe(withGender?.dateOfBirth);
		expect(withoutGender?.surname).toBe(withGender?.surname);
	});
});
