// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Byte-level helpers the parsers share. */

/** Lower case hex, no separators. */
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Space through tilde: a byte that prints as itself and needs no encoding. */
export const isPrintableAsciiByte = (b: number) => b >= 0x20 && b <= 0x7e;

/**
 * Printable ASCII only, which is what the plaintext formats are written in
 * and what tells them apart from the bit-packed ones.
 */
export const isPrintableAscii = (data: Uint8Array) => data.every(isPrintableAsciiByte);

/**
 * Printable ASCII plus Latin-1's upper half, for the records that carry an
 * accented name. C1 stays out: nothing in those layouts can produce it, and
 * letting it through would make other formats' payloads look like text.
 */
export const isLatin1Text = (data: Uint8Array) =>
	data.every((b) => isPrintableAsciiByte(b) || b >= 0xa0);

/**
 * Each byte as the character with that code, 0x00 to 0xff. Built in chunks,
 * since spreading a long payload into one call runs past the argument limit.
 */
export function byteString(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return out;
}

/** A fixed-width ASCII field as a string. */
export const ascii = byteString;

/** Whether the data opens with these bytes, or with this ASCII text. */
export function startsWith(data: Uint8Array, prefix: string | readonly number[]): boolean {
	const bytes = typeof prefix === 'string' ? [...prefix].map((c) => c.charCodeAt(0)) : prefix;
	return data.length >= bytes.length && bytes.every((b, i) => data[i] === b);
}

/** Bytes `start` to `end` as an unsigned big-endian integer. */
export function beUint(data: Uint8Array, start: number, end: number): number {
	let value = 0;
	for (let i = start; i < end; i++) value = value * 256 + data[i];
	return value;
}

/** Standard base64, padded. */
export const toBase64 = (bytes: Uint8Array) => btoa(byteString(bytes));

/** Bytes from standard base64. Throws on anything `atob` refuses. */
export function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

/**
 * ISO 8859-1 as it is defined: byte n is U+00nn. Not TextDecoder's
 * "iso-8859-1", which the WHATWG encoding standard maps to windows-1252 and
 * so turns 0x80 to 0x9f into quotes and dashes.
 */
export const latin1 = byteString;

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/** The bytes as UTF-8, or null where they are not valid UTF-8. */
export function utf8OrNull(data: Uint8Array): string | null {
	try {
		return utf8Strict.decode(data);
	} catch {
		return null;
	}
}

/**
 * A plain text payload as its lines: UTF-8 or nothing, split on LF or CRLF,
 * each trimmed, and the empty lines a trailing newline leaves dropped.
 */
export function textLines(data: Uint8Array): string[] | null {
	const text = utf8OrNull(data);
	if (text === null) return null;
	const lines = text.split(/\r?\n/).map((l) => l.trim());
	while (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines;
}
