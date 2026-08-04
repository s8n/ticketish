// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The line under the wordmark. The arithmetic is the only thing here that can
 * be wrong quietly: an off-by-one picks nothing at all on the last draw.
 */
import { describe, expect, it } from 'vitest';
import { pickTagline, TAGLINES } from '../src/lib/taglines.ts';

describe('picking a tagline', () => {
	it('reaches the first and the last of them', () => {
		expect(pickTagline(() => 0)).toBe(TAGLINES[0]);
		// Math.random never returns 1, so this is the top of its range
		expect(pickTagline(() => 0.999999)).toBe(TAGLINES[TAGLINES.length - 1]);
	});

	it('always returns one of them', () => {
		for (let i = 0; i < TAGLINES.length * 4; i++) {
			expect(TAGLINES).toContain(pickTagline());
		}
	});

	it('opens with the plain one, for anything that reads the first line', () => {
		expect(TAGLINES[0]).toBe('reads what your train ticket really says');
	});

	it('has no repeats and nothing long enough to wrap the masthead', () => {
		expect(new Set(TAGLINES).size).toBe(TAGLINES.length);
		for (const line of TAGLINES) expect(line.length).toBeLessThanOrEqual(50);
	});
});
