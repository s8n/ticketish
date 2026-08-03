// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The plain text fallback, which is what a payload gets when no parser claims
 * it. Some text barcodes are UTF-8 and some are ISO-8859-1, and the second
 * kind used to be shown as an unidentified binary payload.
 *
 * The strings here are invented. The Portuguese one is modelled on a QR that
 * carries nothing but the operator's own address, which is why it is text
 * rather than a format.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);
/** One byte per code point, which is what Latin-1 is. */
const latin1 = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

const asText = (data: Uint8Array) => {
	const c = parsePayload(data);
	return c.kind === 'text' ? c.text : null;
};

describe('plain text payloads', () => {
	it('reads UTF-8, which most text barcodes are', () => {
		expect(asText(utf8('Hello, ticket'))).toBe('Hello, ticket');
		expect(asText(utf8('Grüße aus Köln'))).toBe('Grüße aus Köln');
	});

	it('falls back to ISO-8859-1, which some are', () => {
		// a lone 0xe7 is not valid UTF-8, so a strict decode gives up on the
		// whole payload and the ticket used to show as unknown
		const s = 'CP - Comboios de Portugal\r\nCalçada do Duque, nº20\r\n1249-109 Lisboa';
		const data = latin1(s);
		expect(() => new TextDecoder('utf-8', { fatal: true }).decode(data)).toThrow();
		expect(asText(data)).toBe(s);
	});

	it('keeps the accented characters rather than replacing them', () => {
		const t = asText(latin1('Calçada nº20'));
		expect(t).toContain('ç');
		expect(t).toContain('º');
		expect(t).not.toContain('�');
	});

	it('still refuses binary, which Latin-1 would otherwise decode happily', () => {
		// every byte maps to some character in Latin-1, so the printability test
		// is the only thing keeping a bit-packed payload out of the text view
		const random = new Uint8Array(200);
		for (let i = 0; i < random.length; i++) random[i] = (i * 37 + (i % 11) * 29) & 0xff;
		expect(parsePayload(random).kind).toBe('unknown');

		// C1 controls are the giveaway: no real text uses 0x80 to 0x9f
		const c1 = new Uint8Array(100).fill(0x85);
		expect(parsePayload(c1).kind).toBe('unknown');
		// as are C0 controls below the space
		expect(parsePayload(new Uint8Array(100).fill(0x03)).kind).toBe('unknown');
	});

	it('allows the whitespace that real text contains', () => {
		expect(asText(utf8('one\r\ntwo\tthree\n'))).toBe('one\r\ntwo\tthree\n');
	});

	it('has nothing to say about an empty payload', () => {
		expect(parsePayload(new Uint8Array(0)).kind).toBe('unknown');
	});
});
