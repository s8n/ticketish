/**
 * Integration: real zxing-wasm decode of a sample ticket image, end to end
 * through the envelope parser. Uses the personal sample if present locally;
 * skips otherwise.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const INTERRAIL = fileURLToPath(new URL('../sample-tickets/interrail.png', import.meta.url));

describe.skipIf(!existsSync(INTERRAIL))('zxing-wasm image scan', () => {
	it('finds and parses the Aztec code in interrail.png', async () => {
		const { readBarcodes } = await import('zxing-wasm/reader');
		const results = await readBarcodes(new Uint8Array(readFileSync(INTERRAIL)), {
			formats: ['Aztec'],
			tryHarder: true
		});
		expect(results.length).toBeGreaterThan(0);
		const container = parsePayload(new Uint8Array(results[0].bytes));
		expect(container.kind).toBe('dosipas');
		if (container.kind !== 'dosipas') return;
		expect(container.envelope.records.some((r) => r.kind === 'flex')).toBe(true);
	}, 30000);
});
