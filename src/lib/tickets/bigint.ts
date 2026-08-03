// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Big-endian bigint arithmetic, for the formats that hide their payload
 * inside a signature and hand it back by raising it to a public exponent.
 *
 * The recovery schemes differ (VDV signs ISO 9796-2 scheme 2 with SHA-1, RSP6
 * uses PKCS#1 padding and a truncated SHA-256), so only this much is shared.
 * Nothing here verifies anything: recovering the message is how the data is
 * read, and checking who signed it is deliberately out of scope.
 */

export function bytesToBigInt(b: Uint8Array): bigint {
	let n = 0n;
	for (const x of b) n = (n << 8n) | BigInt(x);
	return n;
}

/**
 * Big-endian bytes. Without a length the result is as short as the value
 * allows, which is what a caller inspecting the first byte of a recovered
 * block wants; with one it is left-padded to exactly that many bytes, which
 * is what a caller comparing against a fixed-width modulus wants.
 */
export function bigIntToBytes(n: bigint, length?: number): Uint8Array {
	if (length === undefined) {
		let width = 0;
		for (let v = n; v > 0n; v >>= 8n) width++;
		length = Math.max(width, 1);
	}
	const out = new Uint8Array(length);
	for (let i = length - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
	let result = 1n;
	base %= mod;
	while (exp > 0n) {
		if (exp & 1n) result = (result * base) % mod;
		base = (base * base) % mod;
		exp >>= 1n;
	}
	return result;
}
