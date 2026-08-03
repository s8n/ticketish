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

/** A fixed-width ASCII field as a string. */
export const ascii = (b: Uint8Array) => String.fromCharCode(...b);
