// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Enough CBOR (RFC 8949) to read a BoB ticket.
 *
 * BoB uses a narrow slice of the format: unsigned integers, byte and text
 * strings, arrays, maps and the three simple values. Everything it carries is
 * definite length, and it has no use for tags, floats or the indefinite length
 * forms, so those are rejected rather than half-supported. A decoder that
 * quietly accepts what the format cannot contain is a worse detector, and
 * detection here is the whole job: `isBob` decides a payload is a BoB ticket
 * by whether it decodes to the right shape.
 *
 * The signature covers the encoded bytes rather than the decoded values, so
 * every nested structure arrives as a byte string that is decoded separately.
 * That is why this returns values rather than a stream: the caller decodes an
 * envelope, takes a byte string out of it, and decodes that in turn.
 */

export type CborValue =
	| number
	| bigint
	| string
	| Uint8Array
	| boolean
	| null
	| CborValue[]
	| { [key: string]: CborValue };

/**
 * The largest payload worth decoding. A ticket is a few hundred bytes and the
 * biggest barcode any reader here produces is a few kilobytes, so this only
 * ever rejects something that was never a ticket: a length header claiming
 * megabytes of array is a reason to stop rather than to allocate.
 */
const MAX_ITEMS = 4096;

class Reader {
	private pos = 0;

	constructor(private readonly data: Uint8Array) {}

	get done(): boolean {
		return this.pos >= this.data.length;
	}

	private byte(): number {
		if (this.pos >= this.data.length) throw new Error('CBOR ended mid-item');
		return this.data[this.pos++];
	}

	private bytes(n: number): Uint8Array {
		if (n > this.data.length - this.pos) throw new Error('CBOR string runs past the end');
		const out = this.data.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}

	/**
	 * The argument of a head byte: either packed into its low five bits or in
	 * the one, two, four or eight bytes after it.
	 *
	 * Eight byte arguments come back as bigint, because a JS number cannot hold
	 * every uint64. Nothing in a ticket is that large, so the callers that need
	 * a length treat one as out of range rather than truncating it.
	 */
	private argument(info: number): number | bigint {
		if (info < 24) return info;
		if (info === 24) return this.byte();
		if (info === 25) return (this.byte() << 8) | this.byte();
		if (info === 26) {
			// >>> 0 because the top bit set would otherwise make this negative
			return ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0;
		}
		if (info === 27) {
			let value = 0n;
			for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(this.byte());
			return value;
		}
		// 28-30 are unassigned and 31 is the indefinite length form
		throw new Error(`unsupported CBOR argument ${info}`);
	}

	/** An argument used as a count, which has to fit in a JS number. */
	private count(info: number): number {
		const value = this.argument(info);
		const tooBig = typeof value === 'bigint' || value > MAX_ITEMS;
		if (tooBig) throw new Error('CBOR length out of range');
		return value;
	}

	value(): CborValue {
		const head = this.byte();
		const major = head >> 5;
		const info = head & 0x1f;
		switch (major) {
			case 0:
				return this.argument(info);
			case 1: {
				const n = this.argument(info);
				return typeof n === 'bigint' ? -1n - n : -1 - n;
			}
			case 2:
				// copied, so the slice does not keep the whole payload alive and
				// callers are free to hold on to it
				return new Uint8Array(this.bytes(this.count(info)));
			case 3:
				return new TextDecoder('utf-8', { fatal: true }).decode(this.bytes(this.count(info)));
			case 4: {
				const out: CborValue[] = [];
				for (let i = this.count(info); i > 0; i--) out.push(this.value());
				return out;
			}
			case 5: {
				const out: { [key: string]: CborValue } = {};
				for (let i = this.count(info); i > 0; i--) {
					const key = this.value();
					// BoB keys its maps by short text strings throughout
					if (typeof key !== 'string') throw new Error('CBOR map key is not text');
					out[key] = this.value();
				}
				return out;
			}
			case 7:
				if (info === 20) return false;
				if (info === 21) return true;
				if (info === 22) return null;
				// 23 is undefined, 25-27 are floats, none of which appear here
				throw new Error(`unsupported CBOR simple value ${info}`);
			default:
				// major 6 is tags, which BoB does not use
				throw new Error(`unsupported CBOR major type ${major}`);
		}
	}
}

/**
 * Decode one CBOR item, which must be the whole input.
 *
 * Trailing bytes are an error rather than something to ignore. A barcode is a
 * fixed payload with nothing after it, so anything left over means the guess
 * that this was CBOR at all was wrong, and saying so is what keeps the
 * detector from claiming another format's ticket.
 */
export function decodeCbor(data: Uint8Array): CborValue {
	const reader = new Reader(data);
	const value = reader.value();
	if (!reader.done) throw new Error('trailing bytes after CBOR item');
	return value;
}

export function isCborMap(value: CborValue): value is { [key: string]: CborValue } {
	if (typeof value !== 'object' || value === null) return false;
	return !ArrayBuffer.isView(value) && !Array.isArray(value);
}

/** A map entry as text, or null when it is absent or some other type. */
export function cborText(map: CborValue, key: string): string | null {
	if (!isCborMap(map)) return null;
	const value = map[key];
	return typeof value === 'string' ? value : null;
}

/** A map entry as a byte string, or null when it is absent or some other type. */
export function cborBytes(map: CborValue, key: string): Uint8Array | null {
	if (!isCborMap(map)) return null;
	const value = map[key];
	return value instanceof Uint8Array ? value : null;
}
