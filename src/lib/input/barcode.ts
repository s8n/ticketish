/**
 * Barcode decoding via zxing-wasm. The WASM binary is bundled and served from
 * our own origin so scanning works offline (PWA).
 *
 * zxing only binarizes the image one way per call, and which way works
 * depends on the source: LocalAverage handles uneven lighting on paper,
 * GlobalHistogram does better on evenly lit screenshots and phone screens.
 * One of our own sample tickets decodes with GlobalHistogram but not with
 * LocalAverage, so a single pass is not enough. Still images retry across
 * binarizers; the camera alternates between them frame by frame, which is
 * what BinaryEye does.
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader';
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

/** Tried in this order for still images; the camera cycles through them. */
export const BINARIZERS = ['LocalAverage', 'GlobalHistogram', 'FixedThreshold'] as const;
export type Binarizer = (typeof BINARIZERS)[number];

const BASE_OPTIONS: ReaderOptions = {
	// UIC tickets are Aztec; QR/DataMatrix/PDF417 cover other rail operators.
	formats: ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'],
	tryHarder: true,
	tryRotate: true,
	tryInvert: true,
	tryDownscale: true
};

function toHits(results: ReadResult[]): BarcodeHit[] {
	return results
		.filter((r) => r.isValid && r.bytes.length > 0)
		.map((r) => ({ format: r.format, bytes: new Uint8Array(r.bytes) }));
}

type Source = Blob | ImageData;

async function read(source: Source, options: ReaderOptions): Promise<BarcodeHit[]> {
	prepare();
	return toHits(await readBarcodes(source as Blob, options));
}

/** Read with each binarizer in turn, stopping at the first that finds anything. */
async function readAllBinarizers(source: Source): Promise<BarcodeHit[]> {
	for (const binarizer of BINARIZERS) {
		const hits = await read(source, { ...BASE_OPTIONS, binarizer });
		if (hits.length) return hits;
	}
	return [];
}

/**
 * Surround pixel data with a white margin. Screenshots are often cropped
 * flush to the barcode, and without a quiet zone the symbol cannot be
 * located at all; giving it one back rescues those.
 */
export function padImageData(image: ImageData, border: number): ImageData {
	const width = image.width + border * 2;
	const height = image.height + border * 2;
	const out = new Uint8ClampedArray(width * height * 4).fill(255);
	for (let y = 0; y < image.height; y++) {
		const from = y * image.width * 4;
		const to = ((y + border) * width + border) * 4;
		out.set(image.data.subarray(from, from + image.width * 4), to);
	}
	return new ImageData(out, width, height);
}

/** Browser-only: decode a source to pixels so it can be padded. */
async function toImageData(source: Source): Promise<ImageData | null> {
	if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;
	try {
		const bitmap = await createImageBitmap(source as ImageBitmapSource);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close?.();
		return ctx.getImageData(0, 0, canvas.width, canvas.height);
	} catch {
		return null;
	}
}

/** Every binarizer, then the same again with a quiet zone added. */
async function readThorough(source: Source): Promise<BarcodeHit[]> {
	const hits = await readAllBinarizers(source);
	if (hits.length) return hits;

	const pixels = source instanceof ImageData ? source : await toImageData(source);
	if (!pixels) return [];
	const border = Math.max(24, Math.round(Math.max(pixels.width, pixels.height) * 0.08));
	return readAllBinarizers(padImageData(pixels, border));
}

export async function scanBlob(blob: Blob): Promise<BarcodeHit[]> {
	return readThorough(blob);
}

/**
 * Scan pixel data. Pass a binarizer to make a single quick pass (the camera
 * does this, alternating per frame); omit it to try them all.
 */
export async function scanImageData(image: ImageData, binarizer?: Binarizer): Promise<BarcodeHit[]> {
	if (!binarizer) return readThorough(image);
	// one symbol is enough for a live viewfinder, and it keeps frames quick
	return read(image, { ...BASE_OPTIONS, binarizer, maxNumberOfSymbols: 1 });
}
