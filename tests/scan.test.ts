// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * End to end scanning: encode a barcode, decode it back, and run the result
 * through the parser. The images are generated here, so no real ticket is
 * involved.
 */
import { describe, expect, it } from 'vitest';
import { readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import { writeBarcode } from 'zxing-wasm/writer';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { uicEnvelope, uicHead, uicRecord } from './helpers/build.ts';

const OPTIONS: ReaderOptions = {
	formats: ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'],
	tryHarder: true,
	tryRotate: true,
	tryInvert: true,
	tryDownscale: true
};

const BINARIZERS = ['LocalAverage', 'GlobalHistogram', 'FixedThreshold'] as const;

/** What the app does: try each binarizer until one reads something. */
async function scan(image: Blob | Uint8Array) {
	for (const binarizer of BINARIZERS) {
		const results = await readBarcodes(image as Blob, { ...OPTIONS, binarizer });
		const valid = results.filter((r) => r.isValid && r.bytes.length);
		if (valid.length) return new Uint8Array(valid[0].bytes);
	}
	return null;
}

describe('barcode round trip', () => {
	it('reads back a UIC ticket encoded as an Aztec code', async () => {
		const payload = uicEnvelope(1080, uicRecord('U_HEAD', 1, uicHead({ rics: 1080 })));
		const written = await writeBarcode(payload, { format: 'Aztec' });
		expect(written.image).toBeTruthy();

		const decoded = await scan(written.image!);
		expect(decoded, 'the encoded barcode did not read back').not.toBeNull();
		expect(Array.from(decoded!)).toEqual(Array.from(payload));

		const container = parsePayload(decoded!);
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		expect(container.envelope.issuerRics).toBe(1080);
	}, 30000);

	it('reads a QR code carrying plain text', async () => {
		const written = await writeBarcode('Ticket Number: TEST-00001', { format: 'QRCode' });
		const decoded = await scan(written.image!);
		expect(decoded).not.toBeNull();
		const container = parsePayload(decoded!);
		expect(container.kind).toBe('text');
		if (container.kind !== 'text') return;
		expect(container.text).toContain('TEST-00001');
	}, 30000);
});
