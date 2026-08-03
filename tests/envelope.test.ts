/** End-to-end envelope parsing over all fixture payloads. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { summarizeFcb, zugbindung, type FcbTicket } from '../src/lib/tickets/model.ts';
import type { FlexData } from '../src/lib/tickets/records/uflex.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

function loadCases() {
	const cases = [];
	// Only the published DB specimen tickets: real tickets never go in tests.
	for (const sub of ['public']) {
		const dir = join(FIXTURES, sub);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.bin')) continue;
			const expected = JSON.parse(
				readFileSync(join(dir, f.replace('.bin', '.expected.json')), 'utf8')
			);
			cases.push({
				name: f.replace('.bin', ''),
				payload: new Uint8Array(readFileSync(join(dir, f))),
				expected
			});
		}
	}
	return cases;
}

const cases = loadCases();

describe('envelope parsing', () => {
	it.each(cases)('parses $name consistently with ground truth', ({ payload, expected }) => {
		const container = parsePayload(payload);
		if (expected.format === '918.3') {
			expect(container.kind).toBe('uic9183');
			if (container.kind !== 'uic9183') return;
			expect(container.envelope.issuerRics).toBe(parseInt(expected.rics, 10));
			expect(container.envelope.records.map((r) => r.id)).toEqual(
				expected.records.map((r: { id: string }) => r.id)
			);
			for (const rec of container.envelope.records) {
				expect(rec.error, `record ${rec.id} error`).toBeUndefined();
				expect(rec.kind, `record ${rec.id} unparsed`).not.toBe('unknown');
			}
		} else if (expected.format?.startsWith('dosipas')) {
			expect(container.kind).toBe('dosipas');
			if (container.kind !== 'dosipas') return;
			expect(container.envelope.records.length).toBe(expected.records.length);
			for (const rec of container.envelope.records) {
				expect(rec.error, `record ${rec.id} error`).toBeUndefined();
			}
		} else if (
			['swisspass', 'rsp6', 'vdv', 'ssb', 'renfe', 'ssb1', 'tcdd', 'trenitalia'].includes(
				expected.format
			)
		) {
			expect(container.kind).toBe(expected.format);
		} else {
			// non-UIC payloads (e.g. plain-text QR codes) fall back to text
			expect(container.kind).toBe('text');
		}
	});

	it('deciphers the Zugbindung of the Super Sparpreis sample', () => {
		const c = cases.find((c) => c.name === 'muster-918-9-fv-supersparpreis');
		if (!c) return; // fixture not present
		const container = parsePayload(c.payload);
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		const flex = container.envelope.records.find((r) => r.kind === 'flex');
		expect(flex).toBeDefined();
		const ticket = (flex!.data as FlexData).ticket as FcbTicket;

		// issuing date 2025 day 92 (2025-04-02); travelDate +3 → 2025-04-05, 719 min → 11:59
		const bindings = zugbindung(ticket);
		expect(bindings).toEqual([
			{
				train: 'ICE573',
				departureDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
				departureTime: '11:59',
				fromStation: 'Mannheim',
				toStation: 'Reutlingen'
			}
		]);
		const issuedYear = ticket.issuingDetail.issuingYear;
		const expectedDate = new Date(Date.UTC(issuedYear, 0, ticket.issuingDetail.issuingDay + 3));
		expect(bindings[0].departureDate).toBe(expectedDate.toISOString().slice(0, 10));

		const docs = summarizeFcb(ticket);
		expect(docs).toHaveLength(1);
		expect(docs[0].type).toBe('openTicket');
	});
});
