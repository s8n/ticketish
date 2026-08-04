// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Reading a payload someone pasted in as text. The payloads are built here,
 * so nothing in this file came off a ticket.
 */
import { describe, expect, it } from 'vitest';
import { readPasted } from '../src/lib/input/pasted.ts';
import { uicEnvelope, uicHead, uicRecord } from './helpers/build.ts';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = () => uicEnvelope(1080, uicRecord('U_HEAD', 1, uicHead({})));

/** A plain-text payload the app recognises: EAV's one field per line. */
const EAV_TEXT = [
	'DIFFERITO_EOD',
	'EAV',
	'2026-09-01T10:00',
	'2026-09-01T23:59',
	'TESTPNR123',
	'21',
	'11',
	'20',
	'0'.repeat(56),
	'2026-09-01T10:00:42+02:00'
].join('\n');

describe('reading pasted text', () => {
	it('takes the text as it stands when a format recognises it', () => {
		const read = readPasted(EAV_TEXT)!;
		expect(read.reading).toBe('text');
		expect(read.kind).toBe('eav');
	});

	it('sees through base64, which is otherwise perfectly good text', () => {
		const read = readPasted(base64(envelope()))!;
		expect(read.reading).toBe('base64');
		expect(read.kind).toBe('uic9183');
		expect(read.bytes).toEqual(envelope());
	});

	it('copes with the base64 a link or an email hands back', () => {
		const wrapped = base64(envelope()).replace(/(.{20})/g, '$1\n');
		expect(readPasted(wrapped)?.kind).toBe('uic9183');
		// URL-safe alphabet, and padding somebody dropped on the way
		const urlSafe = base64(envelope()).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(readPasted(urlSafe)?.kind).toBe('uic9183');
	});

	it('reads a binary payload that survived the clipboard as Latin-1', () => {
		const bytes = envelope();
		const asLatin1 = String.fromCharCode(...bytes);
		const read = readPasted(asLatin1)!;
		expect(read.kind).toBe('uic9183');
		expect(read.bytes).toEqual(bytes);
	});

	it('shows an unrecognised paste as it stands rather than refusing it', () => {
		const read = readPasted('just some words nobody issues tickets in')!;
		expect(read.reading).toBe('text');
		expect(read.kind).toBeNull();
		expect(read.bytes.length).toBe(40);
	});

	it('has nothing to say about an empty box', () => {
		expect(readPasted('')).toBeNull();
		expect(readPasted('   \n ')).toBeNull();
	});
});
