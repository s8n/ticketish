// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Bit-addressed reads over a byte array, which is how most of the older
 * barcodes are laid out: a field is a bit offset and a width rather than a
 * byte and a length.
 *
 * Written here rather than lifted out of any one parser. Several of the
 * parsers that use it are zuegli ports and so are EUPL-1.2 only, and a shared
 * module taken from one of them would pull that on to the parsers that are
 * not. Numbering bits big-endian is a fact about how the formats pack them,
 * not anyone's code, so this stays on the repo's default licence and all of
 * them can import it.
 *
 * Bit 0 is the top bit of byte 0. Ranges are half open, `int(4, 18)` being the
 * fourteen bits from 4 up to but not including 18, which is how the layouts
 * are written down.
 */

/** 6 bit alphanumeric: 0-9, then A-Z, 36 a space and 63 a question mark. */
const ALPHANUMERIC: Record<number, string> = (() => {
	const map: Record<number, string> = {};
	for (let i = 0; i < 10; i++) map[i] = String(i);
	for (let i = 0; i < 26; i++) map[10 + i] = String.fromCharCode(65 + i);
	map[36] = ' ';
	map[63] = '?';
	return map;
})();

export class Bits {
	constructor(private d: Uint8Array) {}

	bit(i: number): number {
		return (this.d[i >> 3] >> (7 - (i & 7))) & 1;
	}

	bool(i: number): boolean {
		return this.bit(i) === 1;
	}

	int(start: number, end: number): number {
		let v = 0;
		for (let i = start; i < end; i++) v = v * 2 + this.bit(i);
		return v;
	}

	/** 6 bit characters offset by 0x20, trimmed of their padding. */
	str(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += String.fromCharCode(this.int(i, i + 6) + 0x20);
		return s.trim();
	}

	/**
	 * 6 bit alphanumeric, as encoded. The padding is left on because the
	 * formats disagree about what it is: some pad with spaces and some with
	 * zeros, and only the caller knows which of its fields is which.
	 */
	strAlpha(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += ALPHANUMERIC[this.int(i, i + 6)] ?? ' ';
		return s;
	}

	/** Re-pack from a bit offset, so a body can be addressed from its own zero. */
	slice(start: number): Bits {
		const bitLen = this.d.length * 8 - start;
		const out = new Uint8Array(Math.ceil(bitLen / 8));
		for (let i = 0; i < bitLen; i++) {
			if (this.bit(start + i)) out[i >> 3] |= 0x80 >> (i & 7);
		}
		return new Bits(out);
	}

	get bytes(): Uint8Array {
		return this.d;
	}
}
