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

const u = (d: Uint8Array, off: number, len: number) => beUint(d, off, off + len);

function parseDbVu(record: RawRecord): DbVuData {
	if (record.version !== 1) throw new Error(`unsupported 0080VU version ${record.version}`);
	const d = record.data;
	let off = 5;
	const travellerCount = d[off++];
	const numProducts = d[off++];
	const products: DbVuProduct[] = [];
	for (let i = 0; i < numProducts; i++) {
		const authorizationNumber = u(d, off, 4);
		const kvpOrgId = u(d, off + 4, 2);
		const productNumber = u(d, off + 6, 2);
		const pvOrgId = u(d, off + 8, 2);
		const validFrom = vdvDateTime(d.subarray(off + 10, off + 14));
		const validTo = vdvDateTime(d.subarray(off + 14, off + 18));
		off += 18;
		let price: number | null = null;
		let sequenceNumber: number | null = null;
		let dataHex: string;
		if (d[off] === 0x85) {
			// "separate data" variant: 0x85, total length, then TLV product data
			const totalLen = d[off + 1];
			dataHex = hex(d.subarray(off + 2, off + totalLen));
			off += totalLen;
		} else {
			price = u(d, off, 3);
			sequenceNumber = u(d, off + 3, 4);
			const fieldsLen = d[off + 7];
			dataHex = hex(d.subarray(off + 8, off + 8 + fieldsLen));
			off += 8 + fieldsLen;
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
