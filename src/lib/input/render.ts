// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Re-encode a scanned payload back into a barcode, so a ticket can be shown as
 * a crisp symbol rather than as the photo it was scanned from.
 *
 * The bytes are always reproduced exactly: zxing's writer takes a byte array,
 * so payloads that are not valid UTF-8 (SSB, VDV, RSP6) survive the round trip
 * unchanged. Reproducing the *shape* of the original symbol takes more than
 * that, because the issuer's encoder made choices the payload alone does not
 * record.
 *
 * The largest of those is how the data was segmented. Every symbology here has
 * compact modes for text (QR numeric and alphanumeric, Aztec digit and upper,
 * DataMatrix ASCII and C40, PDF417 text compaction) alongside a binary mode
 * that spends eight bits on every character. Handing the writer a byte array
 * forces the binary one, which turns the same content into an entirely
 * different codeword stream, and so into an entirely different module pattern
 * even when the version and error correction level are pinned to the
 * original's. On short payloads it is worse than cosmetic: binary mode needs
 * more room, so the very version the data was read out of can turn out too
 * small to write it back into.
 *
 * The decoder does report which of the two was used, as the content type, so a
 * payload the issuer encoded as text is handed back to the writer as a string.
 * That reproduces the segmentation, and with it the symbol itself. Payloads
 * holding anything but printable ASCII stay on the byte path, which is where
 * the binary formats belong anyway.
 *
 * What each format carries over on top of that:
 *
 * - Aztec: the reader reports a layer count without saying whether the symbol
 *   was compact or full-range, and the two numberings overlap, so the layer
 *   count alone is not enough to write the same size back. The scanned
 *   symbol's width separates them. Getting the size right also gets the error
 *   correction share right, since the reader derives its percentage from how
 *   much of the symbol the data did not fill.
 * - QR: L/M/Q/H, the version and the mask pattern are all discrete settings
 *   the writer honours, so these come back exactly. The mask only matters once
 *   the segmentation matches, since it is chosen by scoring the module layout
 *   and different codewords score differently.
 * - DataMatrix: the reader reports a size like "24x64" rather than an index
 *   the writer accepts, so only squareness carries over.
 * - PDF417: this build ignores a requested error correction level and the
 *   reader reports no column count, so nothing carries over and the symbol is
 *   written at the writer's own defaults.
 *
 * Whether it worked is not assumed. Every render is decoded again and checked
 * against the original, and `fidelity` reports what actually came back, so the
 * UI can say when the symbol differs rather than implying it is identical.
 * When an attempt does not come back as the bytes it was made from, the next
 * one is tried rather than shipped: the other input form, then the writer's
 * own defaults.
 *
 * Fidelity is judged on the symbol size, not on the error correction level.
 * For Aztec and PDF417 zxing derives that percentage from how much spare
 * capacity the data left rather than reading back a setting, so two symbols of
 * the same size holding the same bytes routinely report different percentages
 * purely because the two encoders segmented the data differently. It is worth
 * showing, but it is not evidence of anything.
 *
 * Note that 'exact' is still a claim about the symbol size and not about the
 * module pattern: it means the same bytes in the same symbology at the same
 * size, which is a barcode that scans wherever the original did.
 */
import { readBarcodes } from 'zxing-wasm/reader';
import type { BarcodeSymbol } from 'zxing-wasm/writer';
import writerWasmUrl from 'zxing-wasm/writer/zxing_writer.wasm?url';
import type { BarcodeSymbology } from '../tickets/types.ts';
import { isPrintableAsciiByte } from '../tickets/bytes.ts';

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

	const mask = symbology.dataMask;

	switch (symbology.format) {
		case 'Aztec': {
			// zint versions 1-4 are the compact symbols and 5-36 the full-range
			// ones, but zxing reports a bare layer count and both numberings
			// start at 1, so "4" is either a compact 27x27 or a full-range
			// 31x31. Compact layer N measures 11+4N modules across and
			// full-range layer N measures 15+4N, so the scanned size is what
			// tells them apart. Without one, assume full-range: that is what
			// anything longer than a few dozen bytes has to be.
			if (!numeric || version < 1 || version > 32) break;
			const compact = version <= 4 && symbology.size?.width === 11 + 4 * version;
			options.push(`version=${compact ? version : version + 4}`);
			break;
		}
		case 'QRCode':
			if (symbology.ecLevel && /^[LMQH]$/.test(symbology.ecLevel)) {
				options.push(`ecLevel=${symbology.ecLevel}`);
			}
			if (numeric && version >= 1 && version <= 40) options.push(`version=${version}`);
			if (Number.isInteger(mask) && mask! >= 0 && mask! <= 7) options.push(`dataMask=${mask}`);
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
 * The payload as a string, or null if it holds anything a text mode would not
 * take. Printable ASCII plus tab, newline and return: everything above that
 * would need an ECI the original may not have carried, and everything below it
 * is a control byte with no business crossing into the writer as a C string.
 */
function asText(bytes: Uint8Array): string | null {
	const printable = bytes.every(
		(b) => isPrintableAsciiByte(b) || b === 0x09 || b === 0x0a || b === 0x0d
	);
	return printable ? new TextDecoder('ascii').decode(bytes) : null;
}

/** QR's mask pattern, which the reader hides in its `extra` JSON blob. */
function dataMaskOf(extra: string | undefined): number | undefined {
	if (!extra) return undefined;
	try {
		const mask = (JSON.parse(extra) as { DataMask?: unknown }).DataMask;
		return Number.isInteger(mask) ? (mask as number) : undefined;
	} catch {
		return undefined;
	}
}

/** Everything a decode says about how the symbol it read was encoded. */
export function symbologyOf(result: {
	format: string;
	ecLevel?: string;
	version?: string;
	contentType?: string;
	extra?: string;
	symbol?: { width: number; height: number };
}): BarcodeSymbology {
	const { width = 0, height = 0 } = result.symbol ?? {};
	return {
		format: result.format,
		ecLevel: result.ecLevel || undefined,
		version: result.version || undefined,
		// zxing calls a symbol Binary when it was written in the binary mode,
		// even where the bytes would have read perfectly well as text
		textMode: result.contentType ? result.contentType === 'Text' : undefined,
		dataMask: dataMaskOf(result.extra),
		// PDF417 comes back 0x0, meaning the decoder did not rebuild the grid
		size: width && height ? { width, height } : undefined
	};
}

/** One way of asking the writer for this symbol. */
interface Attempt {
	input: string | Uint8Array;
	options: string;
}

/**
 * The writes to try, best first. The content type decides whether text or
 * bytes goes first; the other is still worth a go, because a version pinned
 * from the original can be too small for the segmentation the writer picks.
 * Dropping the options entirely is the last resort, since a symbol at the
 * writer's own choice still beats none.
 */
function attempts(bytes: Uint8Array, symbology: BarcodeSymbology): Attempt[] {
	const options = writerOptions(symbology);
	const text = asText(bytes);
	const inputs: (string | Uint8Array)[] =
		text === null ? [bytes] : symbology.textMode === false ? [bytes, text] : [text, bytes];

	const list = inputs.map((input) => ({ input, options }));
	if (options) list.push(...inputs.map((input) => ({ input, options: '' })));
	return list;
}

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

	// keep the first symbol that came out at all, in case none round-trips
	let best: { symbol: BarcodeSymbol; read: Decoded | null } | null = null;
	let failure = '';

	for (const attempt of attempts(bytes, symbology)) {
		const written = await writeBarcode(attempt.input, { ...base, options: attempt.options });
		if (written.error || !written.image) {
			failure ||= written.error || 'the writer returned no symbol';
			continue;
		}
		const read = await verify(written.image, format);
		best ??= { symbol: written.symbol, read };
		if (read && sameBytes(read.bytes, bytes)) {
			best = { symbol: written.symbol, read };
			break;
		}
	}
	if (!best) throw new Error(failure);

	const { width, height, data } = best.symbol;
	const modules: BarcodeModules = {
		width,
		height,
		// the symbol is one channel, 0 dark and 255 light
		dark: Array.from({ length: width * height }, (_, i) => data[i] < 128)
	};

	const read = best.read;
	const bytesMatch = !!read && sameBytes(read.bytes, bytes);
	// the size the writer reports beats the one read back off the render, which
	// is blank for PDF417 and only ever confirms what we already have
	const actual: BarcodeSymbology | null = read
		? { ...symbologyOf(read), size: { width, height } }
		: null;

	let fidelity: RenderFidelity = 'broken';
	if (bytesMatch && actual) {
		if (actual.format !== format) fidelity = 'resized';
		else if (symbology.size)
			fidelity =
				symbology.size.width === width && symbology.size.height === height ? 'exact' : 'resized';
		else if (!symbology.version || !actual.version) fidelity = 'unknown';
		else fidelity = actual.version === symbology.version ? 'exact' : 'resized';
	}

	return { modules, actual, bytesMatch, fidelity };
}

/** What `verify` hands back, once it has something. */
type Decoded = NonNullable<Awaited<ReturnType<typeof verify>>>;

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
