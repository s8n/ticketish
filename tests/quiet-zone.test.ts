// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Screenshots cropped flush to a barcode have no quiet zone, which stops
 * zxing locating the symbol at all. Scanning adds one back before giving up.
 */
import { describe, expect, it } from 'vitest';
import { padImageData } from '../src/lib/input/barcode.ts';

/** Minimal stand-in so the pure padding logic can run under node. */
class FakeImageData {
	constructor(
		public data: Uint8ClampedArray,
		public width: number,
		public height: number
	) {}
}
globalThis.ImageData ??= FakeImageData as unknown as typeof ImageData;

function solid(width: number, height: number, rgba: [number, number, number, number]): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
	return new ImageData(data, width, height);
}

describe('quiet zone padding', () => {
	const black: [number, number, number, number] = [0, 0, 0, 255];
	const source = solid(4, 3, black);
	const padded = padImageData(source, 2);

	const pixel = (img: ImageData, x: number, y: number) =>
		Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

	it('grows the image by the border on every side', () => {
		expect(padded.width).toBe(8);
		expect(padded.height).toBe(7);
	});

	it('fills the new margin with opaque white', () => {
		expect(pixel(padded, 0, 0)).toEqual([255, 255, 255, 255]);
		expect(pixel(padded, 7, 6)).toEqual([255, 255, 255, 255]);
		expect(pixel(padded, 3, 1)).toEqual([255, 255, 255, 255]);
	});

	it('keeps the original pixels intact and correctly offset', () => {
		expect(pixel(padded, 2, 2)).toEqual([0, 0, 0, 255]);
		expect(pixel(padded, 5, 4)).toEqual([0, 0, 0, 255]);
		// just outside the original block on each edge
		expect(pixel(padded, 1, 2)).toEqual([255, 255, 255, 255]);
		expect(pixel(padded, 6, 4)).toEqual([255, 255, 255, 255]);
	});
});
