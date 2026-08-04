// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Reading a payload someone pasted in as text.
 *
 * A payload arrives as text more often than it looks: copied out of another
 * decoder, quoted in a bug report, or written down from a barcode that would
 * not scan. The text does not say how it was written down, so this tries the
 * ways it plausibly was and keeps the one a parser recognises.
 *
 * Recognition is the whole test. Every candidate "decodes" to something, since
 * `parsePayload` falls back to text and then to unidentified bytes, so a
 * candidate only counts when a format claimed it. Base64 of a UIC ticket is
 * perfectly good text on its own, and reading it as text is exactly the wrong
 * answer.
 */
import { parsePayload } from '../tickets/parse.ts';

/** How the text was read, in the order the readings are tried. */
export type Reading = 'text' | 'latin1' | 'base64';

export interface PastedPayload {
	bytes: Uint8Array;
	reading: Reading;
	/** Which format claimed it, or null when it fell through to text or hex. */
	kind: string | null;
}

const encoder = new TextEncoder();

/** One character per byte, for a payload that survived a copy as Latin-1. */
function latin1Bytes(text: string): Uint8Array | null {
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code > 0xff) return null; // not a byte, so this is not that kind of paste
		out[i] = code;
	}
	return out;
}

/**
 * Base64, forgiving about the things a pasted one picks up: line breaks from
 * an email, and the URL-safe alphabet from anything that travelled in a link.
 * Padding is restored rather than required, since plenty of sources drop it.
 */
function base64Bytes(text: string): Uint8Array | null {
	const compact = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
	if (compact.length < 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
	const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
	try {
		const binary = atob(padded);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

/**
 * The bytes behind some pasted text, read the way that a parser recognises.
 *
 * Falls back to the plain text reading when nothing is recognised, rather than
 * refusing: an unidentified payload still shows as bytes, which is how a
 * dropped file nobody knows the format of behaves too.
 */
export function readPasted(input: string): PastedPayload | null {
	const text = input.trim();
	if (!text) return null;

	const utf8 = encoder.encode(text);
	const latin1 = latin1Bytes(text);
	const candidates: [Reading, Uint8Array | null][] = [
		['text', utf8],
		// only worth a look when it says something different: pure ASCII encodes
		// to the same bytes either way
		['latin1', latin1 && latin1.length !== utf8.length ? latin1 : null],
		['base64', base64Bytes(text)]
	];

	let fallback: PastedPayload | null = null;
	for (const [reading, bytes] of candidates) {
		if (!bytes?.length) continue;
		// A format that is certain of its magic parses rather than guesses, and
		// throws when the rest of the payload does not hold up. Here that is a
		// reading that did not work out, not an error: a UIC header survives a
		// paste that mangled the compressed half behind it, and the same bytes
		// read another way may still be the ticket.
		let kind: string | null = null;
		try {
			kind = parsePayload(bytes).kind;
		} catch {
			continue;
		}
		if (kind !== 'text' && kind !== 'unknown') return { bytes, reading, kind };
		fallback ??= { bytes, reading, kind: null };
	}
	return fallback;
}
