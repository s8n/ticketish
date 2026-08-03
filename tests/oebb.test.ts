/**
 * OeBB issuer record 118199: a JSON validity window keyed with German
 * initials, V for "von" and B for "bis", stored as UTC YYMMDDHHMM.
 *
 * The payload here is built by the test rather than taken from a real
 * ticket, so the dates and the ticket id are invented.
 */
import { describe, expect, it } from 'vitest';
import { zlibSync, strToU8 } from 'fflate';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { fmtVienna, type OebbRecord } from '../src/lib/tickets/records/oebb.ts';

/** Frame a UIC 918.3 record: 6 char id, 2 digit version, 4 digit total length. */
function record(id: string, version: number, body: string): string {
	const length = String(body.length + 12).padStart(4, '0');
	return `${id}${String(version).padStart(2, '0')}${length}${body}`;
}

/** Build a signed-looking 918.3 envelope. The signature is never verified. */
function envelope(issuerRics: number, records: string): Uint8Array {
	const compressed = zlibSync(strToU8(records));
	const header = strToU8(
		`#UT01${String(issuerRics).padStart(4, '0')}00007${'\0'.repeat(50)}` +
			String(compressed.length).padStart(4, '0')
	);
	const out = new Uint8Array(header.length + compressed.length);
	out.set(header);
	out.set(compressed, header.length);
	return out;
}

const VALIDITY = '{"B":"2405120730","V":"2405110730"}';

describe('OeBB validity record', () => {
	const payload = envelope(1181, record('118199', 1, VALIDITY));
	const container = parsePayload(payload);

	it('is recognised as a UIC 918.3 ticket carrying the record', () => {
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		expect(container.envelope.issuerRics).toBe(1181);
		expect(container.envelope.records.map((r) => r.id)).toContain('118199');
	});

	it('reads von and bis as UTC timestamps', () => {
		if (container.kind !== 'uic9183') return;
		const parsed = container.envelope.records.find((r) => r.kind === 'oebb');
		expect(parsed?.error).toBeUndefined();
		const data = parsed?.data as OebbRecord;
		expect(data.validFrom).toBe('2024-05-11T07:30:00Z');
		expect(data.validUntil).toBe('2024-05-12T07:30:00Z');
		expect(data.extra).toEqual({});
	});

	it('keeps unknown keys instead of dropping them', () => {
		const withExtra = parsePayload(
			envelope(1181, record('118199', 1, '{"V":"2405110730","B":"2405120730","X":"7"}'))
		);
		if (withExtra.kind !== 'uic9183') return;
		const data = withExtra.envelope.records.find((r) => r.kind === 'oebb')?.data as OebbRecord;
		expect(data.extra).toEqual({ X: '7' });
	});

	it('shows Austrian local time, an hour ahead of stored UTC in winter', () => {
		expect(fmtVienna('2023-01-27T09:09:00Z')).toContain('10:09');
		expect(fmtVienna('2023-01-27T09:09:00Z')).toContain('27.01.2023');
		expect(fmtVienna(null)).toBeNull();
	});
});
