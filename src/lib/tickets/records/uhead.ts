// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

import { registerRecordParser, type RecordContext } from '../registry.ts';
import type { RawRecord } from '../types.ts';

export interface HeadData {
	distributingRics: number;
	ticketId: string;
	issuedAt: string | null; // ISO, zone unknown (issuer-local)
	flags: { internationalTicket: boolean; editedByAgent: boolean; specimen: boolean };
	/** Specimen bit is set but the issuer is known to misuse the flags field. */
	specimenSuspect: boolean;
	language: string;
	secondLanguage: string | null;
}

// NS (1084) home-print tickets carry flags "6" (edited-by-agent + specimen)
// on genuine tickets, so the specimen bit can't be trusted from them.
const UNRELIABLE_SPECIMEN_RICS = new Set([1084, 1184]);

const ascii = (b: Uint8Array) => String.fromCharCode(...b);

function parseHead(record: RawRecord, ctx: RecordContext): HeadData {
	const d = record.data;
	if (d.length !== 41) throw new Error(`U_HEAD length ${d.length}, expected 41`);
	const distributingRics = parseInt(ascii(d.subarray(0, 4)), 10);
	const ticketId = ascii(d.subarray(4, 24)).replace(/\0+$/, '').trim();
	// DDMMYYYYHHMM, local to the issuer
	const ts = ascii(d.subarray(24, 36));
	let issuedAt: string | null = null;
	if (/^\d{12}$/.test(ts)) {
		issuedAt = `${ts.slice(4, 8)}-${ts.slice(2, 4)}-${ts.slice(0, 2)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}`;
	}
	// Flag byte is usually the ASCII digit, but some issuers write it raw.
	const flagByte = d[36];
	const flags = (flagByte & 0x30) === 0x30 ? parseInt(String.fromCharCode(flagByte), 10) : flagByte;
	const specimen = !!(flags & 4);
	const specimenSuspect =
		specimen &&
		(UNRELIABLE_SPECIMEN_RICS.has(distributingRics) ||
			(ctx.issuerRics !== undefined && UNRELIABLE_SPECIMEN_RICS.has(ctx.issuerRics)));
	return {
		distributingRics,
		ticketId,
		issuedAt,
		flags: {
			internationalTicket: !!(flags & 1),
			editedByAgent: !!(flags & 2),
			specimen
		},
		specimenSuspect,
		language: ascii(d.subarray(37, 39)).trim(),
		secondLanguage: ascii(d.subarray(39, 41)).replace(/\0/g, '').trim() || null
	};
}

registerRecordParser({
	kind: 'head',
	matches: (id) => id === 'U_HEAD',
	parse: parseHead
});
