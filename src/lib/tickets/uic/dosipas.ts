// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** UIC 918.9 / DOSIPAS dynamic barcode: UPER-encoded UicBarcodeHeader envelope. */
import { decodeBarcodeHeader } from '../asn1/index.ts';
import { parseRecord } from '../registry.ts';
import type { DosipasEnvelope, ParsedRecord } from '../types.ts';

interface HeaderLevel1 {
	securityProviderNum?: number;
	securityProviderIA5?: string;
	keyId?: number;
	dataSequence: { dataFormat: string; data: Uint8Array }[];
	endOfValidityYear?: number;
	endOfValidityDay?: number;
	endOfValidityTime?: number;
	validityDuration?: number;
}

interface Header {
	format: string;
	level2SignedData: {
		level1Data: HeaderLevel1;
		level1Signature?: Uint8Array;
		level2Data?: { dataFormat: string; data: Uint8Array };
	};
	level2Signature?: Uint8Array;
}

/** Map a DOSIPAS dataFormat string onto the record registry's id/version keying. */
function toRecord(dataFormat: string, data: Uint8Array): ParsedRecord {
	const fcb = dataFormat.match(/^FCB(\d+)$/);
	if (fcb) {
		return parseRecord({ id: 'U_FLEX', version: parseInt(fcb[1], 10), data }, {});
	}
	return parseRecord({ id: dataFormat.slice(0, 6).padEnd(6, ' '), version: 1, data }, {});
}

export function parseDosipas(data: Uint8Array): DosipasEnvelope {
	const { version, header } = decodeBarcodeHeader(data);
	const h = header as Header;
	const l1 = h.level2SignedData.level1Data;

	let endOfValidity: string | null = null;
	if (l1.endOfValidityYear !== undefined && l1.endOfValidityDay !== undefined) {
		const date = new Date(Date.UTC(l1.endOfValidityYear, 0, 1));
		date.setUTCDate(date.getUTCDate() + l1.endOfValidityDay - 1);
		date.setUTCMinutes(date.getUTCMinutes() + (l1.endOfValidityTime ?? 0));
		endOfValidity = date.toISOString();
	}

	const records = l1.dataSequence.map((r) => toRecord(r.dataFormat, r.data));
	if (h.level2SignedData.level2Data) {
		const l2 = h.level2SignedData.level2Data;
		records.push(toRecord(l2.dataFormat, l2.data));
	}

	return {
		headerVersion: version,
		securityProvider: l1.securityProviderNum ?? l1.securityProviderIA5 ?? null,
		keyId: l1.keyId ?? null,
		endOfValidity,
		validityDuration: l1.validityDuration ?? null,
		records
	};
}
