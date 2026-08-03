// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The older České dráhy barcode, magic `#CD01`.
 *
 * Payloads are assembled by the `build` helper below from invented values.
 * The three timestamp offsets it writes were established from real tickets;
 * no value from one appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isCdLegacy, parseCdLegacy } from '../src/lib/tickets/cd/legacy.ts';

/** Days between the OLE epoch (1899-12-30) and the Unix one. */
const OLE_EPOCH_DAYS = 25569;

/** A local wall clock as the OLE automation date the record stores. */
const ole = (iso: string) => Date.parse(`${iso}Z`) / 86400000 + OLE_EPOCH_DAYS;

function build({
	issued = '2014-07-01T04:59',
	validFrom = '2014-07-01T00:00',
	validUntil = '2014-07-02T00:00',
	magic = '#CD01',
	length = 63
} = {}): Uint8Array {
	const out = new Uint8Array(length);
	for (let i = 0; i < magic.length; i++) out[i] = magic.charCodeAt(i);
	const v = new DataView(out.buffer);
	// filler, so the record is not all zeroes around the fields that matter
	for (let i = 5; i < 17; i++) out[i] = (i * 7) & 0xff;
	if (issued) v.setFloat64(17, ole(issued), true);
	if (validFrom) v.setFloat64(34, ole(validFrom), true);
	if (validUntil) v.setFloat64(42, ole(validUntil), true);
	return out;
}

describe('#CD01 tickets', () => {
	it('reads the three timestamps, as local time with no zone applied', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('cd-legacy');
		if (c.kind !== 'cd-legacy') return;

		// the face prints the issuing stamp to the minute
		expect(c.ticket.issued).toBe('2014-07-01T04:59');
		expect(c.ticket.validFrom).toBe('2014-07-01T00:00');
		expect(c.ticket.validUntil).toBe('2014-07-02T00:00');
	});

	it('handles a validity that ends at six the next morning', () => {
		// which is how the shorter ČD fares are written
		const t = parseCdLegacy(build({ validUntil: '2013-02-04T06:00' }));
		expect(t.validUntil).toBe('2013-02-04T06:00');
	});

	it('keeps the bytes it cannot place, rather than dropping them', () => {
		const t = parseCdLegacy(build());
		// everything after the five character magic
		expect(t.bodyHex).toHaveLength((63 - 5) * 2);
		expect(t.bodyHex).toMatch(/^[0-9a-f]+$/);
	});

	it('rejects anything that is not this record', () => {
		expect(isCdLegacy(build())).toBe(true);

		// the magic is the whole of the identification, plus a real date
		expect(isCdLegacy(build({ magic: '#CD02' }))).toBe(false);
		expect(isCdLegacy(build({ magic: '#UT01' }))).toBe(false);
		// a fixed 63 bytes
		expect(isCdLegacy(build({ length: 62 }))).toBe(false);
		expect(isCdLegacy(build({ length: 64 }))).toBe(false);
		// the issuing stamp has to be a plausible date
		expect(isCdLegacy(build({ issued: '' }))).toBe(false);
		expect(isCdLegacy(new Uint8Array(63))).toBe(false);
	});

	it('leaves a validity field null when it is not a date', () => {
		const t = parseCdLegacy(build({ validFrom: '', validUntil: '' }));
		expect(t.issued).toBe('2014-07-01T04:59');
		expect(t.validFrom).toBeNull();
		expect(t.validUntil).toBeNull();
	});
});
