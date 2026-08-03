// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * ÖBB issuer record "118199".
 *
 * A small JSON object carrying the validity window, with German initials for
 * keys: V for "von" and B for "bis", each YYMMDDHHMM. The timestamps are UTC,
 * which was established by comparing one against the local time printed on
 * the same ticket: an hour apart, Austria in winter.
 */
import { registerRecordParser } from '../registry.ts';
import type { RawRecord } from '../types.ts';

export interface OebbRecord {
	/** ISO UTC timestamps */
	validFrom: string | null;
	validUntil: string | null;
	/** Anything else the record carried, so nothing is silently dropped. */
	extra: Record<string, string>;
}

/**
 * True when the record carried nothing at all. ÖBB does issue a bare "{}"
 * here, and without saying so the view would just be a gap above the raw
 * record, reading as a parser that gave up rather than an empty record.
 */
export function isEmptyOebb(data: OebbRecord): boolean {
	return !data.validFrom && !data.validUntil && Object.keys(data.extra).length === 0;
}

/** YYMMDDHHMM to an ISO UTC timestamp. */
function parseTimestamp(value: string): string | null {
	const m = value.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
	if (!m) return null;
	const [, yy, month, day, hour, minute] = m;
	return `20${yy}-${month}-${day}T${hour}:${minute}:00Z`;
}

function parseOebb(record: RawRecord): OebbRecord {
	const text = new TextDecoder('utf-8').decode(record.data).replace(/\0+$/, '').trim();
	const raw = JSON.parse(text) as Record<string, unknown>;

	const extra: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (key === 'V' || key === 'B') continue;
		extra[key] = String(value);
	}

	return {
		validFrom: typeof raw.V === 'string' ? parseTimestamp(raw.V) : null,
		validUntil: typeof raw.B === 'string' ? parseTimestamp(raw.B) : null,
		extra
	};
}

/** Format an ISO UTC timestamp in Austrian local time, as printed on the ticket. */
export function fmtVienna(iso: string | null): string | null {
	if (!iso) return null;
	const formatted = new Intl.DateTimeFormat('de-AT', {
		timeZone: 'Europe/Vienna',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
	return formatted.replace(',', '');
}

registerRecordParser({
	kind: 'oebb',
	matches: (id) => id === '118199',
	parse: parseOebb
});
