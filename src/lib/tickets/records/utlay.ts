// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

import { registerRecordParser, type RecordContext } from '../registry.ts';
import type { RawRecord } from '../types.ts';
import { ascii } from '../bytes.ts';

export interface LayoutField {
	line: number;
	column: number;
	height: number;
	width: number;
	bold: boolean;
	italic: boolean;
	smallFont: boolean;
	text: string;
}

export interface LayoutData {
	standard: string; // e.g. RCT2
	fields: LayoutField[];
}

// Issuers that 1-index the column field (from zuegli's observations).
const ONE_INDEXED_RICS = new Set([
	60, 1060, 1160, 84, 1084, 1184, 3268, 5188, 9901, 3095, 3606, 3306, 3626, 1174, 1088, 3602
]);

const utf8 = new TextDecoder('utf-8');

function parseLayout(record: RawRecord, ctx: RecordContext): LayoutData {
	const d = record.data;
	if (d.length < 8) throw new Error('U_TLAY too short');
	const offsetX = ctx.issuerRics !== undefined && ONE_INDEXED_RICS.has(ctx.issuerRics) ? -1 : 0;
	const standard = ascii(d.subarray(0, 4));
	const fieldCount = parseInt(ascii(d.subarray(4, 8)), 10);
	const fields: LayoutField[] = [];
	let off = 8;
	for (let i = 0; i < fieldCount; i++) {
		if (d.length < off + 13) throw new Error('U_TLAY field header truncated');
		const num = (a: number, b: number) => parseInt(ascii(d.subarray(off + a, off + b)), 10);
		const line = num(0, 2);
		const column = num(2, 4);
		const height = num(4, 6);
		const width = num(6, 8);
		const formatting = num(8, 9);
		let textLength = num(9, 13);
		if (record.utf8Length) {
			// length counts characters, not bytes
			const chars = [...utf8.decode(d.subarray(off + 13))].slice(0, textLength);
			textLength = new TextEncoder().encode(chars.join('')).length;
		}
		if (d.length < off + 13 + textLength) throw new Error('U_TLAY field text truncated');
		const text = utf8.decode(d.subarray(off + 13, off + 13 + textLength)).replace(/\\n/g, '\n');
		off += 13 + textLength;
		fields.push({
			line,
			column: column + offsetX,
			height,
			width,
			bold: !!(formatting & 1),
			italic: !!(formatting & 2),
			smallFont: !!(formatting & 4),
			text
		});
	}
	return { standard, fields };
}

registerRecordParser({
	kind: 'layout',
	matches: (id) => id === 'U_TLAY',
	parse: parseLayout
});
