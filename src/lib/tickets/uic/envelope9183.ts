// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** UIC 918.3 "#UT" static barcode envelope (also carries U_FLEX for 918.9-era DB tickets). */
import { unzlibSync } from 'fflate';
import type { RawRecord, Uic9183Envelope } from '../types.ts';
import { parseRecord } from '../registry.ts';

const ascii = (b: Uint8Array) => String.fromCharCode(...b);
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

export function isUic9183(data: Uint8Array): boolean {
	return data.length >= 3 && data[0] === 0x23 && data[1] === 0x55 && data[2] === 0x54; // "#UT"
}

/**
 * Split the decompressed payload into records. Record headers declare a total
 * length (including the 12 header bytes); some issuers count UTF-8 characters
 * instead of bytes - the same heuristic zuegli uses handles both.
 */
function splitRecords(raw: Uint8Array): RawRecord[] {
	const records: RawRecord[] = [];
	let off = 0;
	while (off < raw.length) {
		const chunk = raw.subarray(off);
		if (chunk.length < 12) throw new Error('trailing garbage in UIC record stream');
		const id = ascii(chunk.subarray(0, 6));
		const version = parseInt(ascii(chunk.subarray(6, 8)), 10);
		let length = parseInt(ascii(chunk.subarray(8, 12)), 10);
		if (!/^[ -~]{6}$/.test(id) || Number.isNaN(version) || Number.isNaN(length)) {
			throw new Error(`malformed record header at offset ${off}`);
		}
		let utf8Length = false;
		let decoded = '';
		try {
			decoded = [...utf8Strict.decode(chunk.subarray(12))].slice(0, length).join('');
		} catch {
			decoded = '';
		}
		const decodedByteLen = new TextEncoder().encode(decoded).length;
		if (chunk.length < length) {
			if (decoded.length + 12 < length) throw new Error('UIC record data too short');
			length = decodedByteLen + 12;
			utf8Length = true;
		} else if ([...decoded].length + 12 === length && decodedByteLen !== [...decoded].length) {
			length = decodedByteLen + 12;
			utf8Length = true;
		}
		records.push({ id, version, data: chunk.subarray(12, length), utf8Length });
		off += length;
	}
	return records;
}

export function parseUic9183(data: Uint8Array): Uic9183Envelope {
	if (!isUic9183(data)) throw new Error('not a #UT barcode');
	const envelopeVersion = parseInt(ascii(data.subarray(3, 5)), 10);
	if (envelopeVersion !== 1 && envelopeVersion !== 2) {
		throw new Error(`unsupported UIC envelope version ${envelopeVersion}`);
	}
	const issuerRics = parseInt(ascii(data.subarray(5, 9)), 10);
	const keyId = ascii(data.subarray(9, 14));
	const sigLen = envelopeVersion === 1 ? 50 : 64;
	const signature = data.subarray(14, 14 + sigLen);
	const rest = data.subarray(14 + sigLen);
	const dataLength = parseInt(ascii(rest.subarray(0, 4)), 10);
	if (Number.isNaN(dataLength) || rest.length < 4 + dataLength) {
		throw new Error('UIC ticket data truncated');
	}
	const signedData = rest.subarray(4, 4 + dataLength);
	const raw = unzlibSync(signedData);
	const records = splitRecords(raw).map((r) => parseRecord(r, { issuerRics }));
	return { envelopeVersion, issuerRics, keyId, signature, signedData, records };
}
