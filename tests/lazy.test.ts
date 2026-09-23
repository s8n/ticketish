// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The loader every lookup table is imported through. */
import { describe, expect, it } from 'vitest';
import { lazyTable } from '../src/lib/tickets/lazy.ts';

describe('lazyTable', () => {
	it('imports once however many callers ask', async () => {
		let calls = 0;
		const load = lazyTable(async () => ({ n: ++calls }));
		const [a, b] = await Promise.all([load(), load()]);
		expect(a).toBe(b);
		expect(await load()).toBe(a);
		expect(calls).toBe(1);
	});

	it('tries again after a failed import rather than keeping the failure', async () => {
		let calls = 0;
		const load = lazyTable(async () => {
			if (++calls === 1) throw new Error('chunk not there yet');
			return 'table';
		});
		await expect(load()).rejects.toThrow('chunk not there yet');
		expect(await load()).toBe('table');
		expect(calls).toBe(2);
	});
});
