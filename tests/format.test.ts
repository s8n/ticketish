// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Display formatting shared by the views. */
import { describe, expect, it } from 'vitest';
import { fmtStamp } from '../src/lib/tickets/format.ts';

describe('fmtStamp', () => {
	it('shows an instant as the wall clock in the zone given', () => {
		// 09:00 UTC in January is 10:00 in Stockholm, and 12:00 in July
		expect(fmtStamp('2030-01-01T09:00:00Z', 'Europe/Stockholm')).toBe('01.01.2030 10:00');
		expect(fmtStamp('2030-07-01T10:00:00Z', 'Europe/Stockholm')).toBe('01.07.2030 12:00');
		expect(fmtStamp('2030-07-01T12:00:00+02:00', 'Europe/Stockholm')).toBe('01.07.2030 12:00');
	});

	it('shows a wall clock with no zone as written', () => {
		expect(fmtStamp('2030-01-01T09:00', 'Europe/Stockholm')).toBe('01.01.2030 09:00');
	});

	it('shows the placeholder for nothing', () => {
		expect(fmtStamp(null, 'Europe/Stockholm')).toBe('–');
	});
});
