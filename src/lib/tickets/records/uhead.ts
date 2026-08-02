import { registerRecordParser } from '../registry.ts';
import type { RawRecord } from '../types.ts';

export interface HeadData {
	distributingRics: number;
	ticketId: string;
	issuedAt: string | null; // ISO, zone unknown (issuer-local)
	flags: { internationalTicket: boolean; editedByAgent: boolean; specimen: boolean };
	language: string;
	secondLanguage: string | null;
}

const ascii = (b: Uint8Array) => String.fromCharCode(...b);

function parseHead(record: RawRecord): HeadData {
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
	return {
		distributingRics,
		ticketId,
		issuedAt,
		flags: {
			internationalTicket: !!(flags & 1),
			editedByAgent: !!(flags & 2),
			specimen: !!(flags & 4)
		},
		language: ascii(d.subarray(37, 39)).trim(),
		secondLanguage: ascii(d.subarray(39, 41)).replace(/\0/g, '').trim() || null
	};
}

registerRecordParser({
	kind: 'head',
	matches: (id) => id === 'U_HEAD',
	parse: parseHead
});
