/**
 * Re-encode a scanned payload back into a barcode, so a ticket can be shown as
 * a crisp symbol rather than as the photo it was scanned from.
 *
 * The bytes are always reproduced exactly: zxing's writer takes a byte array,
 * so payloads that are not valid UTF-8 (SSB, VDV, RSP6) survive the round trip
 * unchanged. What cannot always be reproduced is the *shape* of the original
 * symbol, because the issuer's encoder made its own choices about how to
 * segment the data and how much error correction to spend:
 *
 * - Aztec: the reader reports the layer count, and zint numbers full-range
 *   Aztec from 5, so layer N is written as version N+4. Pinning the layer
 *   count reproduces the original symbol size, and with it the error
 *   correction share, since the reader derives its percentage from how much
 *   of the symbol the data did not fill.
 * - QR: L/M/Q/H and the version are both discrete settings the writer honours,
 *   so these come back exactly.
 * - DataMatrix: the reader reports a size like "24x64" rather than an index
 *   the writer accepts, so only squareness carries over.
 * - PDF417: this build ignores a requested error correction level and the
 *   reader reports no column count, so nothing carries over and the symbol is
 *   written at the writer's own defaults.
 *
 * Whether it worked is not assumed. Every render is decoded again and checked
 * against the original, and `fidelity` reports what actually came back, so the
 * UI can say when the symbol differs rather than implying it is identical.
 *
 * Fidelity is judged on the symbol size, not on the error correction level.
 * For Aztec and PDF417 zxing derives that percentage from how much spare
 * capacity the data left rather than reading back a setting, so two symbols of
 * the same size holding the same bytes routinely report different percentages
 * purely because the two encoders segmented the data differently. It is worth
 * showing, but it is not evidence of anything.
 *
 * Note that even at 'exact' the module pattern is not guaranteed to be the
 * original one, since mask and segmentation choices are not recoverable from a
 * decode. What 'exact' means is the same bytes in the same symbology at the
 * same symbol size, which is a barcode that scans wherever the original did.
 */
import { readBarcodes } from 'zxing-wasm/reader';
import writerWasmUrl from 'zxing-wasm/writer/zxing_writer.wasm?url';
import type { BarcodeSymbology } from '../tickets/types.ts';

/** One byte per module in the symbol, without a quiet zone. */
export interface BarcodeModules {
	width: number;
	height: number;
	/** Row-major, true where the module is dark. */
	dark: boolean[];
}

/** How close the re-encoded symbol came to the one that was scanned. */
export type RenderFidelity =
	/** Same bytes, same symbology, same symbol size. */
	| 'exact'
	/** Same bytes, but the symbol came out a different size. */
	| 'resized'
	/** Same bytes; the original's size was never reported, so nothing to compare. */
	| 'unknown'
	/** Did not decode back to the bytes it was made from. */
	| 'broken';

export interface RenderedBarcode {
	modules: BarcodeModules;
	/** What the re-encoded symbol turned out to be, read back from the render. */
	actual: BarcodeSymbology | null;
	/** The re-encoded symbol decodes to exactly the original bytes. */
	bytesMatch: boolean;
	fidelity: RenderFidelity;
}

/** Formats the app reads, and so the only ones worth trying to write. */
const WRITABLE = ['Aztec', 'QRCode', 'DataMatrix', 'PDF417'] as const;
type WritableFormat = (typeof WRITABLE)[number];

const isWritable = (format: string): format is WritableFormat =>
	(WRITABLE as readonly string[]).includes(format);

export function canRender(symbology: BarcodeSymbology | undefined): boolean {
	return !!symbology && isWritable(symbology.format);
}

/**
 * Symbology specific settings to hand the writer. Only settings that the
 * writer actually honours are passed; asking for something it ignores or
 * rounds up would make the result look chosen when it was not.
 */
export function writerOptions(symbology: BarcodeSymbology): string {
	const options: string[] = [];
	const version = Number(symbology.version);
	const numeric = Number.isInteger(version);

	switch (symbology.format) {
		case 'Aztec':
			// zint versions 1-4 are the compact symbols and 5-36 the full-range
			// ones, so a full-range layer count N is written as version N+4.
			if (numeric && version >= 1 && version <= 32) options.push(`version=${version + 4}`);
			break;
		case 'QRCode':
			if (symbology.ecLevel && /^[LMQH]$/.test(symbology.ecLevel)) {
				options.push(`ecLevel=${symbology.ecLevel}`);
			}
			if (numeric && version >= 1 && version <= 40) options.push(`version=${version}`);
			break;
		case 'DataMatrix':
			if (symbology.version && /^(\d+)x\1$/.test(symbology.version)) options.push('forceSquare');
			break;
		// PDF417 takes nothing: see the note at the top of the file
	}
	return options.join(',');
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Re-encode `bytes` as `symbology`. Throws if the format cannot be written or
 * the writer refuses the payload outright.
 */
export async function renderBarcode(
	bytes: Uint8Array,
	symbology: BarcodeSymbology
): Promise<RenderedBarcode> {
	const format = symbology.format;
	if (!isWritable(format)) throw new Error(`cannot write ${format} symbols`);

	// the writer WASM is a second binary on top of the reader's, so it is only
	// fetched once someone actually asks to see a barcode
	const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/writer');
	// In the browser the binary has to come from our own origin, or the PWA
	// cannot encode offline. Outside one (tests) the bundler has not rewritten
	// the URL into a served asset, so the package resolves it from disk itself.
	if (typeof document !== 'undefined') {
		prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith('.wasm') ? writerWasmUrl : prefix + path
			}
		});
	}

	// one module per pixel: the grid is what gets drawn, not a raster image
	const base = { format, scale: 1, addHRT: false } as const;
	let written = await writeBarcode(bytes, { ...base, options: writerOptions(symbology) });
	if (written.error) {
		// the requested size can be too small for how this encoder packs the
		// data; a symbol at the writer's own choice still beats none
		written = await writeBarcode(bytes, base);
	}
	if (written.error) throw new Error(written.error);

	const { width, height, data } = written.symbol;
	const modules: BarcodeModules = {
		width,
		height,
		// the symbol is one channel, 0 dark and 255 light
		dark: Array.from({ length: width * height }, (_, i) => data[i] < 128)
	};

	const read = written.image ? await verify(written.image, format) : null;
	const bytesMatch = !!read && sameBytes(read.bytes, bytes);
	const actual: BarcodeSymbology | null = read
		? { format: read.format, ecLevel: read.ecLevel || undefined, version: read.version || undefined }
		: null;

	let fidelity: RenderFidelity = 'broken';
	if (bytesMatch && actual) {
		if (actual.format !== format) fidelity = 'resized';
		else if (!symbology.version || !actual.version) fidelity = 'unknown';
		else fidelity = actual.version === symbology.version ? 'exact' : 'resized';
	}

	return { modules, actual, bytesMatch, fidelity };
}

/** Decode the render, so the result is checked rather than assumed. */
async function verify(image: Blob, format: WritableFormat) {
	const [result] = await readBarcodes(image, { formats: [format], tryHarder: true });
	if (!result?.isValid) return null;
	return { ...result, bytes: new Uint8Array(result.bytes) };
}

/**
 * Paint the module grid into RGBA pixels, `scale` pixels per module with a
 * `quiet` module white border. Used for the PNG export, and by the tests to
 * check that the grid the UI draws is itself scannable.
 */
export function modulesToRgba(
	modules: BarcodeModules,
	scale: number,
	quiet: number
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
	const width = (modules.width + quiet * 2) * scale;
	const height = (modules.height + quiet * 2) * scale;
	const data = new Uint8ClampedArray(width * height * 4).fill(255);
	for (let y = 0; y < modules.height; y++) {
		for (let x = 0; x < modules.width; x++) {
			if (!modules.dark[y * modules.width + x]) continue;
			for (let dy = 0; dy < scale; dy++) {
				const row = ((y + quiet) * scale + dy) * width;
				for (let dx = 0; dx < scale; dx++) {
					const px = (row + (x + quiet) * scale + dx) * 4;
					data[px] = data[px + 1] = data[px + 2] = 0;
				}
			}
		}
	}
	return { data, width, height };
}

/**
 * An SVG path covering every dark module, merging horizontal runs so the path
 * stays short. Coordinates are module units; the caller sets the viewBox.
 */
export function modulesToPath(modules: BarcodeModules): string {
	const parts: string[] = [];
	for (let y = 0; y < modules.height; y++) {
		let run = 0;
		for (let x = 0; x <= modules.width; x++) {
			const dark = x < modules.width && modules.dark[y * modules.width + x];
			if (dark) {
				run++;
			} else if (run) {
				parts.push(`M${x - run} ${y}h${run}v1h-${run}z`);
				run = 0;
			}
		}
	}
	return parts.join('');
}
