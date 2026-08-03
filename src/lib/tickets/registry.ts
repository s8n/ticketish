// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Record-parser registry. Each UIC record type (U_HEAD, U_FLEX, 0080BL, …)
 * registers a parser here; unknown records fall through to a hex/raw view.
 * Add support for new record types by calling registerRecordParser - nothing
 * else needs to change.
 */
import type { ParsedRecord, RawRecord } from './types.ts';

export interface RecordContext {
	/** RICS of the envelope issuer, when known (U_TLAY quirk handling). */
	issuerRics?: number;
}

export interface RecordParser {
	/** Registry key, also used by the UI to pick a renderer. */
	kind: string;
	/** Return true if this parser handles the given record id/version. */
	matches(id: string, version: number): boolean;
	parse(record: RawRecord, ctx: RecordContext): unknown;
}

const parsers: RecordParser[] = [];

export function registerRecordParser(parser: RecordParser): void {
	parsers.push(parser);
}

export function parseRecord(record: RawRecord, ctx: RecordContext): ParsedRecord {
	const base = { id: record.id, version: record.version, raw: record.data };
	const parser = parsers.find((p) => p.matches(record.id, record.version));
	if (!parser) return { ...base, kind: 'unknown', data: null };
	try {
		return { ...base, kind: parser.kind, data: parser.parse(record, ctx) };
	} catch (e) {
		return { ...base, kind: 'unknown', data: null, error: e instanceof Error ? e.message : String(e) };
	}
}
