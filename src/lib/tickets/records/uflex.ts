import { registerRecordParser } from '../registry.ts';
import { decodeFcb } from '../asn1/index.ts';
import type { RawRecord } from '../types.ts';

export interface FlexData {
	fcbVersion: number;
	ticket: unknown; // decoded UicRailTicketData
}

function parseFlex(record: RawRecord): FlexData {
	return {
		fcbVersion: record.version,
		ticket: decodeFcb(record.version, record.data)
	};
}

registerRecordParser({
	kind: 'flex',
	matches: (id) => id === 'U_FLEX',
	parse: parseFlex
});
