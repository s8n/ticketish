// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Minimal BER-TLV reader for the VDV structures (definite lengths only). */

export interface TlvItem {
	tag: number;
	value: Uint8Array;
}

/** The TLV that starts at `i`, and the offset after it. Throws on a truncated one. */
function readTlvAt(data: Uint8Array, i: number): { item: TlvItem; end: number } {
	if (i >= data.length) throw new Error('truncated TLV tag');
	let tag = data[i++];
	if ((tag & 0x1f) === 0x1f) {
		if (i >= data.length) throw new Error('truncated TLV tag');
		tag = (tag << 8) | data[i++];
	}
	if (i >= data.length) throw new Error('truncated TLV length');
	let length = data[i++];
	if (length & 0x80) {
		const n = length & 0x7f;
		if (n === 0 || n > 4 || i + n > data.length) throw new Error('unsupported TLV length');
		length = 0;
		for (let k = 0; k < n; k++) length = (length << 8) | data[i++];
	}
	if (i + length > data.length) throw new Error('truncated TLV value');
	return { item: { tag, value: data.subarray(i, i + length) }, end: i + length };
}

export function parseTlv(data: Uint8Array): TlvItem[] {
	const out: TlvItem[] = [];
	let i = 0;
	while (i < data.length) {
		const { item, end } = readTlvAt(data, i);
		out.push(item);
		i = end;
	}
	return out;
}

/** Read a single TLV from the front of `data`, returning it and the offset after it. */
export const parseFirstTlv = (data: Uint8Array) => readTlvAt(data, 0);

export function tlvMap(data: Uint8Array): Map<number, Uint8Array> {
	const map = new Map<number, Uint8Array>();
	for (const { tag, value } of parseTlv(data)) if (!map.has(tag)) map.set(tag, value);
	return map;
}
