/** DSB ticket (918.3 with U_TLAY only): layout record content checks. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { LayoutData } from '../src/lib/tickets/records/utlay.ts';

const BIN = fileURLToPath(new URL('./fixtures/private/dsb-hh-cph.bin', import.meta.url));

describe.skipIf(!existsSync(BIN))('DSB RCT2 layout ticket', () => {
	it('parses the U_TLAY into positioned fields', () => {
		const container = parsePayload(new Uint8Array(readFileSync(BIN)));
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		const layout = container.envelope.records.find((r) => r.kind === 'layout');
		expect(layout).toBeDefined();
		expect(layout!.error).toBeUndefined();
		const data = layout!.data as LayoutData;
		// DSB writes the standard tag as "RTC2" (sic) - display it verbatim.
		expect(data.standard).toBe('RTC2');
		const texts = data.fields.map((f) => f.text);
		expect(texts).toContain('Hamburg Hbf');
		expect(texts.some((t) => t.includes('København Syd'))).toBe(true);
		// every field has sane grid coordinates
		for (const f of data.fields) {
			expect(f.line).toBeGreaterThanOrEqual(0);
			expect(f.column).toBeGreaterThanOrEqual(0);
			expect(f.column).toBeLessThan(90);
		}
	});
});
