/** Minimal BER-TLV reader for the VDV structures (definite lengths only). */

export interface TlvItem {
	tag: number;
	value: Uint8Array;
}

export function parseTlv(data: Uint8Array): TlvItem[] {
	const out: TlvItem[] = [];
	let i = 0;
	while (i < data.length) {
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
		out.push({ tag, value: data.subarray(i, i + length) });
		i += length;
	}
	return out;
}

/** Read a single TLV from the front of `data`, returning it and the offset after it. */
export function parseFirstTlv(data: Uint8Array): { item: TlvItem; end: number } {
	let i = 0;
	let tag = data[i++];
	if ((tag & 0x1f) === 0x1f) tag = (tag << 8) | data[i++];
	let length = data[i++];
	if (length & 0x80) {
		const n = length & 0x7f;
		if (n === 0 || n > 4) throw new Error('unsupported TLV length');
		length = 0;
		for (let k = 0; k < n; k++) length = (length << 8) | data[i++];
	}
	if (i + length > data.length) throw new Error('truncated TLV value');
	return { item: { tag, value: data.subarray(i, i + length) }, end: i + length };
}

export function tlvMap(data: Uint8Array): Map<number, Uint8Array> {
	const map = new Map<number, Uint8Array>();
	for (const { tag, value } of parseTlv(data)) if (!map.has(tag)) map.set(tag, value);
	return map;
}
