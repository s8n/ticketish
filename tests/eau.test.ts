// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The PDF417 on the Krankenkasse copy of a German eAU.
 *
 * Every payload is built field by field by the `build` helper below from
 * invented values. The field numbers are table 17 of the KBV technical annex;
 * no value from anybody's sick note appears here, and the diagnosis codes are
 * picked to be obviously made up.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isEau, parseEau } from '../src/lib/tickets/kbv/eau.ts';

/** ISO 8859-15, which is what the barcode is encoded in. */
function latin9(s: string): Uint8Array {
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		// the eight positions ISO 8859-15 moved, of which only € is used here
		out[i] = c === 0x20ac ? 0xa4 : c;
	}
	return out;
}

/** Field number (1 based, per table 17) to content. */
type Fields = Record<number, string>;

const DEFAULTS: Fields = {
	1: '01',
	2: 'a',
	3: '11',
	4: '20301231', // Versicherungsschutz Ende
	5: '100000000', // Kostenträgerkennung
	6: 'X999999999', // Versicherten-ID
	7: '1', // Versichertenart
	10: '900000000', // (N)BSNR
	11: '800000000', // LANR
	12: '20240701', // Ausstellungsdatum
	13: '1', // Erstbescheinigung
	17: '20240701', // arbeitsunfähig seit
	18: '20240705', // voraussichtliche AU bis
	19: '20240701', // festgestellt am
	27: 'A00.0 G'
};

/**
 * Join the fields the way the dynamic format does: every field TAB
 * terminated except the last, each only as long as its content.
 */
function build(fields: Fields = {}, count = 28): Uint8Array {
	const all = { ...DEFAULTS, ...fields };
	const parts: string[] = [];
	for (let n = 1; n <= count; n++) parts.push(all[n] ?? '');
	return latin9(parts.join('\t'));
}

describe('eAU barcode', () => {
	it('reads the fields the sick note also prints', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('kbv-eau');
		if (c.kind !== 'kbv-eau') return;

		expect(c.certificate.version).toBe(11);
		expect(c.certificate.payerId).toBe('100000000');
		expect(c.certificate.insuredId).toBe('X999999999');
		expect(c.certificate.insuredType).toBe('1');
		expect(c.certificate.bsnr).toBe('900000000');
		expect(c.certificate.lanr).toBe('800000000');
		expect(c.certificate.issuedOn).toBe('2024-07-01');
		expect(c.certificate.unfitSince).toBe('2024-07-01');
		expect(c.certificate.unfitUntil).toBe('2024-07-05');
		expect(c.certificate.assessedOn).toBe('2024-07-01');
		expect(c.certificate.coverageEnd).toBe('2030-12-31');
	});

	it('reads the tick boxes as set only where the field carries a 1', () => {
		const none = parseEau(build());
		expect(none.initial).toBe(true);
		expect(none.followUp).toBe(false);
		expect(none.final).toBe(false);
		expect(none.workAccident).toBe(false);
		expect(none.referredToDArzt).toBe(false);
		expect(none.otherAccident).toBe(false);
		expect(none.bvg).toBe(false);
		expect(none.rehabilitation).toBe(false);
		expect(none.reintegration).toBe(false);
		expect(none.sickPayCase).toBe(false);

		// Endbescheinigung is field 26 and may be set beside Folgebescheinigung
		const all = parseEau(
			build({ 13: '', 14: '1', 15: '1', 16: '1', 20: '1', 21: '1', 22: '1', 23: '1', 25: '1', 26: '1' })
		);
		expect(all.initial).toBe(false);
		expect(all.followUp).toBe(true);
		expect(all.final).toBe(true);
		expect(all.workAccident).toBe(true);
		expect(all.referredToDArzt).toBe(true);
		expect(all.otherAccident).toBe(true);
		expect(all.bvg).toBe(true);
		expect(all.rehabilitation).toBe(true);
		expect(all.reintegration).toBe(true);
		expect(all.sickPayCase).toBe(true);
	});

	it('splits the diagnoses and the two letters that may follow each', () => {
		// the shape P7-03 gives as its example: comma and a space between codes,
		// a space between the code, the Diagnosesicherheit and the side
		const t = parseEau(build({ 27: 'A00.0 G, B11.1 Z, C22.2 G L' }));
		expect(t.diagnoses).toEqual([
			{ code: 'A00.0', certainty: 'G', laterality: null, unread: [] },
			{ code: 'B11.1', certainty: 'Z', laterality: null, unread: [] },
			{ code: 'C22.2', certainty: 'G', laterality: 'L', unread: [] }
		]);
	});

	it('reads a bare code with neither letter after it', () => {
		expect(parseEau(build({ 27: 'A00.0' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: null, laterality: null, unread: [] }
		]);
	});

	it('ignores the separator a producer leaves before an absent side', () => {
		// seen in the wild: the code, the Diagnosesicherheit, then the space
		// that would have preceded a Seitenlokalisation that is not there
		expect(parseEau(build({ 27: 'A00.0 G ' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: 'G', laterality: null, unread: [] }
		]);
	});

	it('splits on the comma whatever spacing comes with it', () => {
		expect(parseEau(build({ 27: 'A00.0 G,B11.1 Z ,  C22.2' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: 'G', laterality: null, unread: [] },
			{ code: 'B11.1', certainty: 'Z', laterality: null, unread: [] },
			{ code: 'C22.2', certainty: null, laterality: null, unread: [] }
		]);
	});

	it('places each letter by its set rather than its position', () => {
		// a side with no Diagnosesicherheit before it is still a side
		expect(parseEau(build({ 27: 'A00.0 L' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: null, laterality: 'L', unread: [] }
		]);
		// a certainty after the side, or a piece that is neither, is kept
		// rather than read into a field or dropped
		expect(parseEau(build({ 27: 'A00.0 G L X' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: 'G', laterality: 'L', unread: ['X'] }
		]);
		expect(parseEau(build({ 27: 'A00.0 R G' })).diagnoses).toEqual([
			{ code: 'A00.0', certainty: null, laterality: 'R', unread: ['G'] }
		]);
	});

	it('carries no diagnosis where the field is empty', () => {
		expect(parseEau(build({ 27: '' })).diagnoses).toEqual([]);
	});

	it('keeps the free text fields as written', () => {
		const t = parseEau(build({ 24: 'Stufenweise Wiederaufnahme ab Montag', 28: 'Kontrolle vereinbart' }));
		expect(t.otherMeasures).toBe('Stufenweise Wiederaufnahme ab Montag');
		expect(t.diagnosisNote).toBe('Kontrolle vereinbart');
	});

	it('decodes ISO 8859-15 rather than UTF-8 or windows-1252', () => {
		// the byte 0xa4 is € in 8859-15 and ¤ in 8859-1, and the annex names
		// 8859-15 as the character set
		const t = parseEau(build({ 24: 'Zuzahlung 10 €' }));
		expect(t.otherMeasures).toBe('Zuzahlung 10 €');
	});

	it('leaves out a date that is not one rather than repairing it', () => {
		expect(parseEau(build({ 17: '20241301' })).unfitSince).toBe(null);
		expect(parseEau(build({ 18: '2024070' })).unfitUntil).toBe(null);
		expect(parseEau(build({ 4: '' })).coverageEnd).toBe(null);
		// a day the month does not have
		expect(parseEau(build({ 17: '20240231' })).unfitSince).toBe(null);
		expect(parseEau(build({ 18: '20230229' })).unfitUntil).toBe(null);
		// but the leap day of a leap year is one
		expect(parseEau(build({ 18: '20240229' })).unfitUntil).toBe('2024-02-29');
	});

	it('keeps fields a producer appends past the table', () => {
		const t = parseEau(build({ 29: 'extra' }, 29));
		expect(t.extraFields).toEqual(['extra']);
		// and the table's own last field is still read
		expect(parseEau(build()).extraFields).toEqual([]);
	});

	it('rejects payloads that are not this barcode', () => {
		expect(isEau(build())).toBe(true);

		// the Formularcode names a different Muster
		expect(isEau(build({ 1: '02' }))).toBe(false);
		// the Ausfertigung is not the one the barcode is printed on
		expect(isEau(build({ 2: 'b' }))).toBe(false);
		// version 09 and below is the superseded Muster 1a/E layout
		expect(isEau(build({ 3: '09' }))).toBe(false);
		expect(isEau(build({ 3: '10' }))).toBe(false);
		// no issue date, so this is not the record it claims to be
		expect(isEau(build({ 12: '' }))).toBe(false);
		// truncated before the issue date
		expect(isEau(build({}, 8))).toBe(false);
		// binary, which no amount of tabs makes into this
		expect(isEau(new Uint8Array([1, 2, 3, 9, 4, 5]))).toBe(false);
	});

	it('accepts a later barcode version, and says which one it read', () => {
		// the version counts up, and the annex is the only published table
		const t = parseEau(build({ 3: '12' }));
		expect(t.version).toBe(12);
		expect(t.issuedOn).toBe('2024-07-01');
	});

	it('does not swallow the other text formats, or they it', () => {
		// EAV and UZ split on newlines, and this record has none
		const c = parsePayload(build());
		expect(c.kind).toBe('kbv-eau');
		// a tab separated payload that is not this one falls through to text
		expect(parsePayload(latin9('01\tb\t11\t\t\t\t\t\t\t\t\t20240701')).kind).toBe('text');
	});
});
