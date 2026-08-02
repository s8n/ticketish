/**
 * Barcode decoding via zxing-wasm. The WASM binary is bundled and served from
 * our own origin so scanning works offline (PWA).
 */
import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let prepared = false;

function prepare() {
	if (prepared) return;
	prepared = true;
	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) =>
				path.endsWith('.wasm') ? wasmUrl : prefix + path
		}
	});
}

export interface BarcodeHit {
	format: string;
	bytes: Uint8Array;
}

import type { ReaderOptions } from 'zxing-wasm/reader';

const READ_OPTIONS: ReaderOptions = {
	// UIC tickets are Aztec; QR/DataMatrix/PDF417 cover other rail operators.
	formats: ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'],
	tryHarder: true,
	tryRotate: true,
	tryInvert: true
};

function toHits(results: ReadResult[]): BarcodeHit[] {
	return results
		.filter((r) => r.isValid && r.bytes.length > 0)
		.map((r) => ({ format: r.format, bytes: new Uint8Array(r.bytes) }));
}

export async function scanBlob(blob: Blob): Promise<BarcodeHit[]> {
	prepare();
	return toHits(await readBarcodes(blob, READ_OPTIONS));
}

export async function scanImageData(image: ImageData): Promise<BarcodeHit[]> {
	prepare();
	return toHits(await readBarcodes(image, READ_OPTIONS));
}
