/**
 * Real zxing-wasm decoding of sample images, end to end through the parser.
 * Uses the personal samples if present locally; skips otherwise.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import { parsePayload } from '../src/lib/tickets/parse.ts';

const sample = (name: string) => fileURLToPath(new URL(`../sample-tickets/${name}`, import.meta.url));

const INTERRAIL = sample('interrail.png');
// This one decodes with GlobalHistogram but not with LocalAverage, which is
// why scanning retries across binarizers instead of taking a single pass.
const AIRPORT_PLUS = sample('germany-mvg/mvg-airportplus.png');

const OPTIONS: ReaderOptions = {
	formats: ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'],
	tryHarder: true,
	tryRotate: true,
	tryInvert: true,
	tryDownscale: true
};

describe.skipIf(!existsSync(INTERRAIL))('zxing-wasm image scan', () => {
	it('finds and parses the Aztec code in interrail.png', async () => {
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

describe.skipIf(!existsSync(AIRPORT_PLUS))('binarizer fallback', () => {
	it('needs a binarizer other than LocalAverage for the airport-plus ticket', async () => {
		const data = new Uint8Array(readFileSync(AIRPORT_PLUS));
		const local = await readBarcodes(data, { ...OPTIONS, binarizer: 'LocalAverage' });
		const global = await readBarcodes(data, { ...OPTIONS, binarizer: 'GlobalHistogram' });
		expect(local.filter((r) => r.isValid)).toHaveLength(0);
		expect(global.filter((r) => r.isValid).length).toBeGreaterThan(0);
	}, 30000);

	it('decodes it when trying binarizers in turn, as the app does', async () => {
		const data = new Uint8Array(readFileSync(AIRPORT_PLUS));
		let hit: Uint8Array | null = null;
		for (const binarizer of ['LocalAverage', 'GlobalHistogram', 'FixedThreshold'] as const) {
			const results = await readBarcodes(data, { ...OPTIONS, binarizer });
			const valid = results.filter((r) => r.isValid && r.bytes.length);
			if (valid.length) {
				hit = new Uint8Array(valid[0].bytes);
				break;
			}
		}
		expect(hit).not.toBeNull();
		expect(parsePayload(hit!).kind).toBe('vdv');
	}, 30000);
});
