// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Re-encoding a scanned payload back into a barcode.
 *
 * These go through the real zxing writer and then decode the result again, so
 * they check the claim the UI makes rather than just the option strings. All
 * payloads are built here.
 */
import { describe, expect, it } from 'vitest';
import { readBarcodes } from 'zxing-wasm/reader';
import { writeBarcode } from 'zxing-wasm/writer';
import {
	canRender,
	modulesToPath,
	modulesToRgba,
	renderBarcode,
	symbologyOf,
	writerOptions,
	type BarcodeModules
} from '../src/lib/input/render.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** A payload the length of a real ticket, with no valid UTF-8 in it. */
const binary = new Uint8Array(114).map((_, i) => (i * 37 + 0x31) & 0xff);

type Writable = 'Aztec' | 'QRCode' | 'DataMatrix' | 'PDF417';

/** The dark modules of a written symbol, in the shape `renderBarcode` returns. */
const gridOf = (symbol: { width: number; height: number; data: Uint8ClampedArray }) => ({
	width: symbol.width,
	height: symbol.height,
	dark: Array.from(symbol.data, (v) => v < 128)
});

/**
 * Stand in for an issuer's encoder: write a symbol, then read it back the way
 * a scan would, so a test has both the module grid to aim at and the only
 * information the app ever gets to aim with.
 */
async function issue(format: Writable, content: string | Uint8Array) {
	const written = await writeBarcode(content, { format, scale: 1, addHRT: false });
	expect(written.error, `issuing a ${format} should not fail`).toBeFalsy();
	const [read] = await readBarcodes(written.image!, { formats: [format], tryHarder: true });
	expect(read?.isValid).toBe(true);
	return {
		bytes: new Uint8Array(read.bytes),
		symbology: symbologyOf(read),
		contentType: read.contentType,
		grid: gridOf(written.symbol)
	};
}

describe('writer options', () => {
	it('shifts the Aztec layer count into zint version numbering', () => {
		// zint versions 1-4 are compact Aztec, so full-range layer N is N+4
		expect(writerOptions({ format: 'Aztec', version: '5' })).toBe('version=9');
		expect(writerOptions({ format: 'Aztec', version: '6' })).toBe('version=10');
		// out of range, and the percentage the reader derives is not a setting
		expect(writerOptions({ format: 'Aztec', version: '99', ecLevel: '35%' })).toBe('');
		expect(writerOptions({ format: 'Aztec' })).toBe('');
	});

	it('separates compact Aztec from full-range by the size that was scanned', () => {
		// layer 4 is a 27x27 compact symbol or a 31x31 full-range one, and the
		// reader calls both of them "4"
		const layer4 = { format: 'Aztec', version: '4' };
		expect(writerOptions({ ...layer4, size: { width: 27, height: 27 } })).toBe('version=4');
		expect(writerOptions({ ...layer4, size: { width: 31, height: 31 } })).toBe('version=8');
		// with nothing to go on, full-range: compact stops at 27 modules, which
		// holds far too little for a ticket
		expect(writerOptions(layer4)).toBe('version=8');
		// past layer 4 there is no compact symbol left to confuse it with
		const layer9 = { format: 'Aztec', version: '9', size: { width: 51, height: 51 } };
		expect(writerOptions(layer9)).toBe('version=13');
	});

	it('passes QR error correction, version and mask straight through', () => {
		expect(writerOptions({ format: 'QRCode', ecLevel: 'M', version: '5' })).toBe(
			'ecLevel=M,version=5'
		);
		// a percentage is not one of QR's four levels
		expect(writerOptions({ format: 'QRCode', ecLevel: '30%' })).toBe('');
		expect(writerOptions({ format: 'QRCode', version: '5', dataMask: 0 })).toBe(
			'version=5,dataMask=0'
		);
		// there are eight masks, and only QR has them at all
		expect(writerOptions({ format: 'QRCode', dataMask: 8 })).toBe('');
		expect(writerOptions({ format: 'Aztec', version: '5', dataMask: 3 })).toBe('version=9');
	});

	it('keeps only squareness for DataMatrix and nothing for PDF417', () => {
		expect(writerOptions({ format: 'DataMatrix', version: '44x44' })).toBe('forceSquare');
		expect(writerOptions({ format: 'DataMatrix', version: '24x64' })).toBe('');
		// this build ignores a requested PDF417 level, so none is asked for
		expect(writerOptions({ format: 'PDF417', ecLevel: '16%' })).toBe('');
	});

	it('only offers formats it can write', () => {
		expect(canRender({ format: 'Aztec' })).toBe(true);
		expect(canRender({ format: 'PDF417' })).toBe(true);
		expect(canRender({ format: 'Code128' })).toBe(false);
		expect(canRender(undefined)).toBe(false);
	});
});

describe('rendering', () => {
	it('reproduces the payload byte for byte, including non-UTF-8 bytes', async () => {
		for (const format of ['Aztec', 'QRCode', 'DataMatrix', 'PDF417']) {
			const r = await renderBarcode(binary, { format });
			expect(r.bytesMatch, `${format} should round-trip`).toBe(true);
			expect(r.modules.width).toBeGreaterThan(0);
		}
	});

	it('reproduces an Aztec symbol at the layer count it was read at', async () => {
		// what a UIC 918.3 ticket looks like coming off the scanner
		const payload = ascii('#UT01' + 'X'.repeat(120));
		const plain = await renderBarcode(payload, { format: 'Aztec' });
		const pinned = await renderBarcode(payload, {
			format: 'Aztec',
			version: String(Number(plain.actual?.version) + 1)
		});

		// asking for one more layer than the writer picked gives a bigger symbol
		expect(pinned.bytesMatch).toBe(true);
		expect(pinned.modules.width).toBeGreaterThan(plain.modules.width);
		expect(Number(pinned.actual?.version)).toBe(Number(plain.actual?.version) + 1);
	});

	it('calls the fidelity exact only when the symbol size came back the same', async () => {
		const payload = ascii('#UT01' + 'X'.repeat(120));
		const first = await renderBarcode(payload, { format: 'Aztec' });
		expect(first.actual?.version).toBeTruthy();

		// feeding back the size the writer produced must now agree
		const again = await renderBarcode(payload, first.actual!);
		expect(again.fidelity).toBe('exact');

		// a version the payload cannot fit in falls back to the writer's choice,
		// which is reported as a resize rather than passed off as a match
		const tooSmall = await renderBarcode(payload, { format: 'Aztec', version: '1' });
		expect(tooSmall.bytesMatch).toBe(true);
		expect(tooSmall.fidelity).toBe('resized');

		// PDF417 reports no version, so there is nothing to compare against
		const pdf = await renderBarcode(payload, { format: 'PDF417', ecLevel: '16%' });
		expect(pdf.bytesMatch).toBe(true);
		expect(pdf.fidelity).toBe('unknown');
	});

	it('does not let a derived error correction figure count against fidelity', async () => {
		// zxing computes the Aztec percentage from spare capacity, so a symbol
		// of the right size still reports a different one; that must stay exact
		const payload = ascii('#UT01' + 'X'.repeat(120));
		const sized = await renderBarcode(payload, { format: 'Aztec' });
		const r = await renderBarcode(payload, {
			format: 'Aztec',
			version: sized.actual!.version,
			ecLevel: '99%'
		});
		expect(r.actual?.ecLevel).not.toBe('99%');
		expect(r.fidelity).toBe('exact');
	});

	it('honours the four QR correction levels', async () => {
		const payload = ascii('TEST'.repeat(20));
		for (const ecLevel of ['L', 'M', 'Q', 'H']) {
			const r = await renderBarcode(payload, { format: 'QRCode', ecLevel });
			expect(r.actual?.ecLevel, `QR ${ecLevel}`).toBe(ecLevel);
			expect(r.bytesMatch).toBe(true);
		}
	});

	it('refuses a format it cannot write', async () => {
		await expect(renderBarcode(binary, { format: 'Code128' })).rejects.toThrow(/cannot write/);
	});
});

describe('reproducing the original module pattern', () => {
	/** Long enough that binary mode still fits, so only segmentation differs. */
	const text = 'HTTPS://EXAMPLE.INVALID/T/' + '9'.repeat(60);

	it('reads the segmentation and the mask back off a scan', async () => {
		const qr = await issue('QRCode', text);
		expect(qr.contentType).toBe('Text');
		expect(qr.symbology.textMode).toBe(true);
		expect(qr.symbology.dataMask).toBeGreaterThanOrEqual(0);
		expect(qr.symbology.dataMask).toBeLessThanOrEqual(7);

		// the same content written as bytes is the binary mode, and says so
		const bin = await issue('QRCode', ascii(text));
		expect(bin.contentType).toBe('Binary');
		expect(bin.symbology.textMode).toBe(false);

		// only QR has a mask, and nothing reports one it does not have
		const aztec = await issue('Aztec', text);
		expect(aztec.symbology.dataMask).toBeUndefined();
	});

	it('rebuilds a text symbol module for module, in every format', async () => {
		for (const format of ['QRCode', 'Aztec', 'DataMatrix', 'PDF417'] as const) {
			const original = await issue(format, text);
			const r = await renderBarcode(original.bytes, original.symbology);
			expect(r.bytesMatch, `${format} should round-trip`).toBe(true);
			expect(r.modules, `${format} should come back identical`).toEqual(original.grid);
		}
	});

	it('rebuilds a binary symbol module for module too', async () => {
		// the content type points the other way here, and following it matters
		// just as much: a text write would miss this symbol by the same margin
		for (const format of ['QRCode', 'Aztec', 'DataMatrix'] as const) {
			const original = await issue(format, ascii(text));
			expect(original.symbology.textMode).toBe(false);
			const r = await renderBarcode(original.bytes, original.symbology);
			expect(r.bytesMatch, `${format} should round-trip`).toBe(true);
			expect(r.modules, `${format} should come back identical`).toEqual(original.grid);
		}
	});

	it('keeps the original version on a payload binary mode could not fit', async () => {
		// 24 alphanumeric characters fit a version 1 QR; the same 24 bytes need
		// 20 codewords where the symbol holds 19, so the byte path has to lose
		// the version to encode at all
		const original = await issue('QRCode', 'AB1234567890CD5566778899');
		expect(original.symbology.version).toBe('1');

		const r = await renderBarcode(original.bytes, original.symbology);
		expect(r.actual?.version).toBe('1');
		expect(r.fidelity).toBe('exact');
		expect(r.modules).toEqual(original.grid);
	});

	it('judges fidelity on the size that was scanned, not the version string', async () => {
		// a compact Aztec and a full-range one both call themselves layer 4, so
		// the version string alone would have called this exact either way
		const original = await issue('Aztec', 'A'.repeat(60));
		expect(original.symbology.size).toEqual({ width: 27, height: 27 });

		const same = await renderBarcode(original.bytes, original.symbology);
		expect(same.fidelity).toBe('exact');
		expect(same.modules.width).toBe(27);

		// drop the size and the same layer count writes the full-range symbol
		const guessed = await renderBarcode(original.bytes, { ...original.symbology, size: undefined });
		expect(guessed.bytesMatch).toBe(true);
		expect(guessed.modules.width).toBe(31);
	});

	it('still writes a payload that has no text form at all', async () => {
		// nothing to prefer here, so this is the byte path as it always was
		const r = await renderBarcode(binary, { format: 'QRCode', textMode: true });
		expect(r.bytesMatch).toBe(true);
		expect(r.actual?.textMode).toBe(false);
	});
});

describe('the grid that gets drawn', () => {
	/** The same rasteriser the PNG download uses. */
	const toImage = (modules: BarcodeModules, scale: number, quiet: number) =>
		({ ...modulesToRgba(modules, scale, quiet), colorSpace: 'srgb' }) satisfies ImageData;

	it('is a scannable barcode in its own right, not just zxing internals', async () => {
		// what the tab shows is drawn from `modules`, so that grid is what has
		// to scan, independently of the image the writer handed back
		for (const format of ['Aztec', 'QRCode', 'PDF417'] as const) {
			const r = await renderBarcode(binary, { format });
			const image = toImage(r.modules, 4, 4);
			const [back] = await readBarcodes(image, { formats: [format], tryHarder: true });
			expect(back?.isValid, `${format} grid should decode`).toBe(true);
			expect(new Uint8Array(back!.bytes)).toEqual(binary);
		}
	});

	it('rasterises at the requested scale with a quiet zone all round', () => {
		const modules: BarcodeModules = { width: 2, height: 2, dark: [true, false, false, true] };
		const { data, width, height } = modulesToRgba(modules, 3, 1);
		expect([width, height]).toEqual([12, 12]);

		const at = (x: number, y: number) => data[(y * width + x) * 4];
		// the quiet zone is white on every side
		expect(at(0, 0)).toBe(255);
		expect(at(11, 11)).toBe(255);
		// and each dark module fills its whole 3x3 block
		expect(at(3, 3)).toBe(0);
		expect(at(5, 5)).toBe(0);
		expect(at(6, 3)).toBe(255);
		expect(at(8, 8)).toBe(0);
	});
});

describe('module grid to SVG path', () => {
	const grid = (rows: string[]): BarcodeModules => ({
		width: rows[0].length,
		height: rows.length,
		dark: rows.flatMap((r) => [...r].map((c) => c === '#'))
	});

	it('merges runs of dark modules in a row into one rect', () => {
		expect(modulesToPath(grid(['###']))).toBe('M0 0h3v1h-3z');
		expect(modulesToPath(grid(['#.#']))).toBe('M0 0h1v1h-1zM2 0h1v1h-1z');
	});

	it('closes a run that reaches the end of a row', () => {
		// without the sentinel column the trailing run would be dropped
		expect(modulesToPath(grid(['.##']))).toBe('M1 0h2v1h-2z');
	});

	it('keeps rows separate and skips empty ones', () => {
		expect(modulesToPath(grid(['#.', '..', '.#']))).toBe('M0 0h1v1h-1zM1 2h1v1h-1z');
		expect(modulesToPath(grid(['..', '..']))).toBe('');
	});
});
