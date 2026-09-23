// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** The day of the year helpers that several formats date themselves with. */
import { describe, expect, it } from 'vitest';
import { calendarDate, dayOfYearOnOrAfter, resolveDayOfYear } from '../src/lib/tickets/dates.ts';

describe('resolveDayOfYear', () => {
	it('places a day in the nearest year', () => {
		expect(resolveDayOfYear(5, new Date('2026-12-20T00:00:00Z'))).toBe('2027-01-05');
		expect(resolveDayOfYear(360, new Date('2026-01-03T00:00:00Z'))).toBe('2025-12-26');
	});

	it('only takes day 366 from a leap year', () => {
		expect(resolveDayOfYear(366, new Date('2024-06-01T00:00:00Z'))).toBe('2024-12-31');
		// none of 2025, 2026 or 2027 has one, and 1 January is not it
		expect(resolveDayOfYear(366, new Date('2026-06-01T00:00:00Z'))).toBeNull();
	});
});

describe('dayOfYearOnOrAfter', () => {
	it('keeps a later day in the same year and moves an earlier one to the next', () => {
		expect(dayOfYearOnOrAfter(20, '2025-01-10')).toBe('2025-01-20');
		expect(dayOfYearOnOrAfter(10, '2024-12-15')).toBe('2025-01-10');
	});

	it('counts the same day as on or after', () => {
		expect(dayOfYearOnOrAfter(60, '2024-02-29')).toBe('2024-02-29');
	});

	it('rejects day 366 where neither year has one', () => {
		expect(dayOfYearOnOrAfter(366, '2025-03-01')).toBeNull();
		expect(dayOfYearOnOrAfter(366, '2023-03-01')).toBe('2024-12-31');
	});
});

describe('calendarDate', () => {
	it('writes a real date', () => {
		expect(calendarDate(2026, 9, 23)).toBe('2026-09-23');
		expect(calendarDate(2024, 2, 29)).toBe('2024-02-29');
	});

	it('refuses one the month does not have rather than rolling it over', () => {
		expect(calendarDate(2026, 2, 29)).toBeNull();
		expect(calendarDate(2026, 4, 31)).toBeNull();
		expect(calendarDate(2026, 13, 1)).toBeNull();
		expect(calendarDate(2026, 0, 10)).toBeNull();
		expect(calendarDate(2026, 1, 0)).toBeNull();
	});
});
