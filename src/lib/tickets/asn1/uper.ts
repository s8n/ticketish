// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Minimal unaligned PER (X.691) decoder, driven by JSON schemas produced by
 * scripts/compile-asn.mjs from the UIC ASN.1 specs.
 *
 * Supports the subset those specs use: SEQUENCE (with extension additions),
 * CHOICE, ENUMERATED, SEQUENCE OF, INTEGER, IA5String, UTF8String,
 * OCTET STRING, BIT STRING, OBJECT IDENTIFIER, BOOLEAN, OPTIONAL/DEFAULT.
 */

export interface AsnSchema {
	root: string;
	types: Record<string, AsnType>;
}

export type AsnType =
	| { kind: 'sequence'; ext: boolean; fields: AsnField[] }
	| {
			kind: 'choice';
			ext: boolean;
			alternatives: { name: string; type: AsnType }[];
			extAlternatives: { name: string; type: AsnType }[];
	  }
	| { kind: 'enum'; ext: boolean; root: string[]; extAlternatives: string[] }
	| { kind: 'seqof'; size: SizeRange | null; of: AsnType }
	| { kind: 'int'; min: number | null; max: number | null }
	| { kind: 'ia5'; size: SizeRange | null }
	| { kind: 'utf8' }
	| { kind: 'octets'; size: SizeRange | null }
	| { kind: 'bits'; size: SizeRange | null }
	| { kind: 'oid' }
	| { kind: 'bool' }
	| { kind: 'ref'; name: string };

export interface AsnField {
	name: string;
	type: AsnType;
	optional?: boolean;
	default?: number | string;
	extension?: boolean;
}

export interface Choice {
	__choice__: string;
	value: unknown;
}

export class UperError extends Error {}

export class BitReader {
	private pos = 0; // bit position
	constructor(private data: Uint8Array) {}

	get bitsLeft(): number {
		return this.data.length * 8 - this.pos;
	}

	bit(): number {
		if (this.pos >= this.data.length * 8) throw new UperError('read past end of data');
		const byte = this.data[this.pos >> 3];
		const bit = (byte >> (7 - (this.pos & 7))) & 1;
		this.pos++;
		return bit;
	}

	/** Read n bits (n <= 53) as an unsigned number, MSB first. */
	bits(n: number): number {
		if (n > 53) throw new UperError(`cannot read ${n} bits into a number`);
		let v = 0;
		for (let i = 0; i < n; i++) v = v * 2 + this.bit();
		return v;
	}

	bytes(n: number): Uint8Array {
		const out = new Uint8Array(n);
		for (let i = 0; i < n; i++) out[i] = this.bits(8);
		return out;
	}
}

function bitWidth(range: number): number {
	// smallest b with 2^b >= range
	let b = 0;
	let v = 1;
	while (v < range) {
		v *= 2;
		b++;
	}
	return b;
}

interface SizeRange {
	min: number;
	max: number;
}

export class UperDecoder {
	constructor(
		private schema: AsnSchema,
		private r: BitReader
	) {}

	static decode(schema: AsnSchema, data: Uint8Array, root?: string): unknown {
		const dec = new UperDecoder(schema, new BitReader(data));
		return dec.decodeType(schema.types[root ?? schema.root]);
	}

	private resolve(t: AsnType): AsnType {
		let seen = 0;
		while (t.kind === 'ref') {
			const next = this.schema.types[t.name];
			if (!next) throw new UperError(`unresolved type ${t.name}`);
			t = next;
			if (++seen > 100) throw new UperError('type reference cycle');
		}
		return t;
	}

	/** General unconstrained length determinant (returns item count). */
	private lengthDet(): { n: number; more: boolean } {
		if (this.r.bit() === 0) return { n: this.r.bits(7), more: false };
		if (this.r.bit() === 0) return { n: this.r.bits(14), more: false };
		// fragmentation: 6 bits giving multiplier of 16384
		const m = this.r.bits(6);
		if (m < 1 || m > 4) throw new UperError(`invalid length fragment multiplier ${m}`);
		return { n: m * 16384, more: true };
	}

	/** Constrained or unconstrained count for SIZE constraints. */
	private count(size: SizeRange | null): { n: number; more: boolean } {
		if (size && size.max < 65536) {
			if (size.min === size.max) return { n: size.min, more: false };
			return { n: size.min + this.r.bits(bitWidth(size.max - size.min + 1)), more: false };
		}
		return this.lengthDet();
	}

	/** X.691 normally small non-negative whole number (enum/choice ext index). */
	private normallySmall(): number {
		if (this.r.bit() === 0) return this.r.bits(6);
		const { n, more } = this.lengthDet();
		if (more) throw new UperError('oversized normally-small number');
		let v = 0;
		for (let i = 0; i < n; i++) v = v * 256 + this.r.bits(8);
		return v;
	}

	/** X.691 normally small length with lower bound 1 (ext additions count). */
	private normallySmallLength(): number {
		if (this.r.bit() === 0) return this.r.bits(6) + 1;
		const { n, more } = this.lengthDet();
		if (more) throw new UperError('oversized extension addition count');
		return n;
	}

	private openTypeBytes(): Uint8Array {
		const chunks: Uint8Array[] = [];
		for (;;) {
			const { n, more } = this.lengthDet();
			chunks.push(this.r.bytes(n));
			if (!more) break;
		}
		if (chunks.length === 1) return chunks[0];
		const total = chunks.reduce((a, c) => a + c.length, 0);
		const out = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			out.set(c, off);
			off += c.length;
		}
		return out;
	}

	decodeType(t: AsnType): unknown {
		t = this.resolve(t);
		switch (t.kind) {
			case 'sequence':
				return this.decodeSequence(t);
			case 'choice':
				return this.decodeChoice(t);
			case 'enum':
				return this.decodeEnum(t);
			case 'seqof':
				return this.decodeSeqOf(t);
			case 'int':
				return this.decodeInt(t);
			case 'ia5':
				return this.decodeIA5(t);
			case 'utf8':
				return this.decodeUtf8();
			case 'octets':
				return this.decodeOctets(t);
			case 'bits':
				return this.decodeBits(t);
			case 'oid':
				return this.decodeOid();
			case 'bool':
				return this.r.bit() === 1;
			default:
				throw new UperError(`unsupported kind ${(t as AsnType).kind}`);
		}
	}

	private decodeSequence(t: Extract<AsnType, { kind: 'sequence' }>): Record<string, unknown> {
		const rootFields = t.fields.filter((f) => !f.extension);
		const extFields = t.fields.filter((f) => f.extension);

		const extPresent = t.ext ? this.r.bit() === 1 : false;
		const presence: boolean[] = [];
		for (const f of rootFields) {
			presence.push(f.optional || f.default !== undefined ? this.r.bit() === 1 : true);
		}

		const out: Record<string, unknown> = {};
		rootFields.forEach((f, i) => {
			if (presence[i]) out[f.name] = this.decodeType(f.type);
			else if (f.default !== undefined) out[f.name] = f.default;
		});

		if (extPresent) {
			const n = this.normallySmallLength();
			const extPresence: boolean[] = [];
			for (let i = 0; i < n; i++) extPresence.push(this.r.bit() === 1);
			for (let i = 0; i < n; i++) {
				if (!extPresence[i]) continue;
				const bytes = this.openTypeBytes();
				const field = extFields[i];
				if (field) {
					const inner = new UperDecoder(this.schema, new BitReader(bytes));
					out[field.name] = inner.decodeType(field.type);
				}
				// unknown extension additions are skipped
			}
		}
		return out;
	}

	private decodeChoice(t: Extract<AsnType, { kind: 'choice' }>): Choice {
		if (t.ext && this.r.bit() === 1) {
			const idx = this.normallySmall();
			const bytes = this.openTypeBytes();
			const alt = t.extAlternatives[idx];
			if (alt) {
				const inner = new UperDecoder(this.schema, new BitReader(bytes));
				return { __choice__: alt.name, value: inner.decodeType(alt.type) };
			}
			return { __choice__: `_ext${idx}`, value: bytes };
		}
		const n = t.alternatives.length;
		const idx = n > 1 ? this.r.bits(bitWidth(n)) : 0;
		const alt = t.alternatives[idx];
		if (!alt) throw new UperError(`invalid choice index ${idx}`);
		return { __choice__: alt.name, value: this.decodeType(alt.type) };
	}

	private decodeEnum(t: Extract<AsnType, { kind: 'enum' }>): string {
		if (t.ext && this.r.bit() === 1) {
			const idx = this.normallySmall();
			return t.extAlternatives[idx] ?? `_ext${idx}`;
		}
		const idx = t.root.length > 1 ? this.r.bits(bitWidth(t.root.length)) : 0;
		const name = t.root[idx];
		if (name === undefined) throw new UperError(`invalid enum index ${idx}`);
		return name;
	}

	private decodeSeqOf(t: Extract<AsnType, { kind: 'seqof' }>): unknown[] {
		const out: unknown[] = [];
		for (;;) {
			const { n, more } = this.count(t.size);
			for (let i = 0; i < n; i++) out.push(this.decodeType(t.of));
			if (!more) break;
		}
		return out;
	}

	private decodeInt(t: Extract<AsnType, { kind: 'int' }>): number {
		if (t.min !== null && t.max !== null) {
			const range = t.max - t.min + 1;
			if (range === 1) return t.min;
			return t.min + this.r.bits(bitWidth(range));
		}
		// (semi-)unconstrained: length determinant + big-endian integer
		const { n, more } = this.lengthDet();
		if (more || n > 7) throw new UperError('oversized integer');
		if (n === 0) throw new UperError('zero-length integer');
		let v = 0;
		const bytes = this.r.bytes(n);
		if (t.min !== null) {
			// semi-constrained: unsigned offset from lower bound
			for (const b of bytes) v = v * 256 + b;
			return t.min + v;
		}
		v = bytes[0] & 0x80 ? -1 : 0;
		for (const b of bytes) v = v * 256 + (v < 0 ? b - 256 : b);
		return v;
	}

	private decodeIA5(t: Extract<AsnType, { kind: 'ia5' }>): string {
		let s = '';
		for (;;) {
			const { n, more } = this.count(t.size);
			for (let i = 0; i < n; i++) s += String.fromCharCode(this.r.bits(7));
			if (!more) break;
		}
		return s;
	}

	private decodeUtf8(): string {
		const bytes = this.openTypeBytes();
		return new TextDecoder('utf-8').decode(bytes);
	}

	private decodeOctets(t: Extract<AsnType, { kind: 'octets' }>): Uint8Array {
		if (t.size && t.size.min === t.size.max && t.size.max < 65536) {
			return this.r.bytes(t.size.min);
		}
		if (t.size && t.size.max < 65536) {
			const n = t.size.min + this.r.bits(bitWidth(t.size.max - t.size.min + 1));
			return this.r.bytes(n);
		}
		return this.openTypeBytes();
	}

	private decodeBits(t: Extract<AsnType, { kind: 'bits' }>): { length: number; bytes: Uint8Array } {
		let n: number;
		if (t.size && t.size.min === t.size.max && t.size.max < 65536) n = t.size.min;
		else if (t.size && t.size.max < 65536)
			n = t.size.min + this.r.bits(bitWidth(t.size.max - t.size.min + 1));
		else {
			const d = this.lengthDet();
			if (d.more) throw new UperError('fragmented bit string unsupported');
			n = d.n;
		}
		const bytes = new Uint8Array(Math.ceil(n / 8));
		for (let i = 0; i < n; i++) {
			if (this.r.bit()) bytes[i >> 3] |= 0x80 >> (i & 7);
		}
		return { length: n, bytes };
	}

	private decodeOid(): string {
		const { n, more } = this.lengthDet();
		if (more) throw new UperError('oversized OID');
		const bytes = this.r.bytes(n);
		const arcs: number[] = [];
		let v = 0;
		for (let i = 0; i < bytes.length; i++) {
			v = v * 128 + (bytes[i] & 0x7f);
			if ((bytes[i] & 0x80) === 0) {
				if (arcs.length === 0) {
					const first = Math.min(Math.floor(v / 40), 2);
					arcs.push(first, v - first * 40);
				} else {
					arcs.push(v);
				}
				v = 0;
			}
		}
		return arcs.join('.');
	}
}

export function decodeUper(schema: AsnSchema, data: Uint8Array, root?: string): unknown {
	return UperDecoder.decode(schema, data, root);
}
