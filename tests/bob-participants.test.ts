// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The BoB participant register.
 *
 * The table is checked for the shape it has to keep rather than for the names
 * in it, which change as participants join. The one test that would fail on a
 * bad rebuild is the last: the register names a contact person against every
 * participant, and none of them belongs in this repository.
 */
import { describe, expect, it } from 'vitest';
import table from '../src/lib/tickets/bob/participants.json' with { type: 'json' };
import { bobParticipantName, bobParticipantLabel } from '../src/lib/tickets/bob/participants.ts';

const participants = table.participants as Record<string, string>;

describe('BoB participants', () => {
	it('is keyed by bare numeric ids', () => {
		const keys = Object.keys(participants);
		expect(keys.length).toBeGreaterThan(20);
		for (const key of keys) expect(key).toMatch(/^\d+$/);
	});

	it('holds no reserved ranges, which no barcode carries', () => {
		for (const key of Object.keys(participants)) expect(key).not.toContain('-');
	});

	it('names every id the table holds', () => {
		for (const id of Object.keys(participants)) {
			expect(bobParticipantLabel(id)).not.toBe(`BoB participant ${id}`);
		}
	});

	it('returns the register wording wherever no override applies', () => {
		const entries = Object.entries(participants);
		const verbatim = entries.filter(([id, name]) => bobParticipantName(id) === name);
		// an override is the exception, so nearly every id comes through untouched
		expect(verbatim.length).toBeGreaterThan(entries.length - 5);
	});

	it('falls back to the id for one the register has not got', () => {
		expect(bobParticipantName('99999999')).toBeNull();
		expect(bobParticipantLabel('99999999')).toBe('BoB participant 99999999');
	});

	it('says so when there is no id at all', () => {
		expect(bobParticipantName(null)).toBeNull();
		expect(bobParticipantName(undefined)).toBeNull();
		expect(bobParticipantLabel(null)).toBe('BoB ticket');
	});

	it('applies the overrides over the generated table', () => {
		// the register's cell for this one is a sentence, not a name
		expect(bobParticipantName('1')).toBe('BoB test services');
		expect(participants['1']).not.toBe('BoB test services');
	});

	it('keeps the provenance note with the data', () => {
		expect(table._note).toMatch(/samtrafiken/i);
		expect(table._note).toMatch(/no reuse licence/i);
	});

	/**
	 * The column after the organisation name is the participant's type, and the
	 * one after that is a named contact person. A rebuild that took the wrong
	 * column is the way those would get in here, and it would shift every row at
	 * once, so catching the type words catches it precisely.
	 *
	 * Guarding this by trying to recognise a person's name instead does not
	 * work: "Länstrafiken Kronoberg" is two capitalised words and so is every
	 * other regional authority in the register.
	 */
	it('holds organisation names rather than the columns beside them', () => {
		const types = ['operator', 'reseller', 'supplier', 'administrator', 'validation partner'];
		for (const [id, name] of Object.entries(participants)) {
			expect(name.trim()).not.toBe('');
			if (types.includes(name.trim().toLowerCase())) {
				throw new Error(`participant ${id} has a column shifted into it: ${name}`);
			}
			// the implementation status columns are a letter or two per cell
			expect(name.trim()).not.toMatch(/^C?S?$/);
		}
	});
});
