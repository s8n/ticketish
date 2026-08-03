/**
 * Re-encoding a scanned payload back into a barcode.
 *
 * These go through the real zxing writer and then decode the result again, so
 * they check the claim the UI makes rather than just the option strings. All
 * payloads are built here.
 */
import { describe, expect, it } from 'vitest';
import { readBarcodes } from 'zxing-wasm/reader';
import {
	canRender,
	modulesToPath,
	renderBarcode,
	writerOptions,
	type BarcodeModules
} from '../src/lib/input/render.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** A payload the length of a real ticket, with no valid UTF-8 in it. */
const binary = new Uint8Array(114).map((_, i) => (i * 37 + 0x31) & 0xff);

describe('writer options', () => {
	it('shifts the Aztec layer count into zint version numbering', () => {
		// zint versions 1-4 are compact Aztec, so full-range layer N is N+4
		expect(writerOptions({ format: 'Aztec', version: '5' })).toBe('version=9');
		expect(writerOptions({ format: 'Aztec', version: '6' })).toBe('version=10');
		// out of range, and the percentage the reader derives is not a setting
		expect(writerOptions({ format: 'Aztec', version: '99', ecLevel: '35%' })).toBe('');
		expect(writerOptions({ format: 'Aztec' })).toBe('');
	});

	it('passes QR error correction and version straight through', () => {
		expect(writerOptions({ format: 'QRCode', ecLevel: 'M', version: '5' })).toBe(
			'ecLevel=M,version=5'
		);
		// a percentage is not one of QR's four levels
		expect(writerOptions({ format: 'QRCode', ecLevel: '30%' })).toBe('');
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

describe('the grid that gets drawn', () => {
	/** Blow the module grid up to pixels, the way the SVG paints it. */
	function toImage(modules: BarcodeModules, scale: number, quiet: number) {
		const width = (modules.width + quiet * 2) * scale;
		const height = (modules.height + quiet * 2) * scale;
		const data = new Uint8ClampedArray(width * height * 4).fill(255);
		for (let y = 0; y < modules.height; y++) {
			for (let x = 0; x < modules.width; x++) {
				if (!modules.dark[y * modules.width + x]) continue;
				for (let dy = 0; dy < scale; dy++) {
					for (let dx = 0; dx < scale; dx++) {
						const px = ((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx;
						data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
					}
				}
			}
		}
		return { data, width, height, colorSpace: 'srgb' } satisfies ImageData;
	}

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
