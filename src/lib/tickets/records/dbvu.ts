// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * DB 0080VU record - VDV-KA product authorizations (Verbund tickets).
 * Light port: product/org identifiers, validity window and price. The deeply
 * nested VDV spatial-validity structures are kept as raw bytes.
 */
import { registerRecordParser } from '../registry.ts';
import type { RawRecord } from '../types.ts';
import { beUint, hex } from '../bytes.ts';
import { vdvDateTime } from '../vdv/datetime.ts';

export interface DbVuProduct {
	authorizationNumber: number;
	kvpOrgId: number;
	productNumber: number;
	pvOrgId: number;
	validFrom: string | null;
	validTo: string | null;
	price: number | null; // euro cents
	sequenceNumber: number | null;
	dataHex: string;
}

export interface DbVuData {
	travellerCount: number;
	products: DbVuProduct[];
}

/** An unsigned big-endian integer of `length` bytes at `offset`, the way the record counts fields. */
const uintAt = (data: Uint8Array, offset: number, length: number) =>
	beUint(data, offset, offset + length);

function parseDbVu(record: RawRecord): DbVuData {
	if (record.version !== 1) throw new Error(`unsupported 0080VU version ${record.version}`);
	const data = record.data;
	let offset = 5;
	const travellerCount = data[offset++];
	const numProducts = data[offset++];
	const products: DbVuProduct[] = [];
	for (let i = 0; i < numProducts; i++) {
		const authorizationNumber = uintAt(data, offset, 4);
		const kvpOrgId = uintAt(data, offset + 4, 2);
		const productNumber = uintAt(data, offset + 6, 2);
		const pvOrgId = uintAt(data, offset + 8, 2);
		const validFrom = vdvDateTime(data.subarray(offset + 10, offset + 14));
		const validTo = vdvDateTime(data.subarray(offset + 14, offset + 18));
		offset += 18;
		let price: number | null = null;
		let sequenceNumber: number | null = null;
		let dataHex: string;
		if (data[offset] === 0x85) {
			// "separate data" variant: 0x85, total length, then TLV product data
			const totalLength = data[offset + 1];
			dataHex = hex(data.subarray(offset + 2, offset + totalLength));
			offset += totalLength;
		} else {
			price = uintAt(data, offset, 3);
			sequenceNumber = uintAt(data, offset + 3, 4);
			const fieldsLength = data[offset + 7];
			dataHex = hex(data.subarray(offset + 8, offset + 8 + fieldsLength));
			offset += 8 + fieldsLength;
		}
		products.push({
			authorizationNumber,
			kvpOrgId,
			productNumber,
			pvOrgId,
			validFrom,
			validTo,
			price,
			sequenceNumber,
			dataHex
		});
	}
	return { travellerCount, products };
}

registerRecordParser({
	kind: 'db-vu',
	matches: (id) => id === '0080VU',
	parse: parseDbVu
});
