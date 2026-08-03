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
// Photographed on patterned security paper, slightly blurred and angled.
// zxing-cpp 2.x could not decode these in any configuration; 3.x reads them
// straight from the original JPEG, which is why the library version matters.
const PHOTOS = [
	'austria-oebb/IMG_20230203_175657.jpg',
	'austria-oebb/IMG_20230203_175702.jpg'
];
// Cropped flush to the symbol, so it has no quiet zone at all.
const CROPPED = sample('difficult-images/Screenshot_20220518-131809_MVG Fahrinfo~2.png');

const OPTIONS: ReaderOptions = {
	formats: ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'],
	tryHarder: true,
	tryRotate: true,
	tryInvert: true,
	tryDownscale: true
};

const readAll = async (file: string) => {
	const data = new Uint8Array(readFileSync(file));
	for (const binarizer of ['LocalAverage', 'GlobalHistogram', 'FixedThreshold'] as const) {
		const results = await readBarcodes(data, { ...OPTIONS, binarizer });
		const valid = results.filter((r) => r.isValid && r.bytes.length);
		if (valid.length) return new Uint8Array(valid[0].bytes);
	}
	return null;
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

describe.skipIf(!PHOTOS.every((p) => existsSync(sample(p))))('hard photographs', () => {
	it.each(PHOTOS)('decodes %s', async (name) => {
		const bytes = await readAll(sample(name));
		expect(bytes, 'no barcode found').not.toBeNull();
		expect(parsePayload(bytes!).kind).not.toBe('unknown');
	}, 60000);
});

describe.skipIf(!existsSync(CROPPED))('missing quiet zone', () => {
	it('cannot read a barcode cropped flush to its edges', async () => {
		// Documents why scanning pads and retries; the padding itself is
		// covered by tests/quiet-zone.test.ts.
		expect(await readAll(CROPPED)).toBeNull();
	}, 60000);
});
