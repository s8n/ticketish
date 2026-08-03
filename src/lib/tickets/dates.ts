// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Date helpers for the formats that date themselves by day of the year, or
 * that record only part of the year and leave the rest to be assumed.
 */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * A day of the year as an ISO date. 1 January is day 1. Day 366 of a common
 * year is rejected rather than rolled into the next one.
 */
export function dayOfYearDate(year: number, dayOfYear: number): string | null {
	if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
	const d = new Date(Date.UTC(year, 0, 1));
	d.setUTCDate(d.getUTCDate() + dayOfYear - 1);
	if (d.getUTCFullYear() !== year) return null;
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Expand the last digit of a year into a full one.
 *
 * Some records carry a single digit and leave the decade to the reader, so it
 * has to be assumed. The digit always dates the ticket's issue rather than
 * its travel, and nothing is issued in the future, so take the most recent
 * year ending in that digit that has already begun. The answer sits in the
 * ten year window ending today; a ticket older than that reads as one decade
 * too new, which is the least surprising way to be wrong.
 *
 * Travel later than the issuing year still works, because the fields counted
 * against this one are free to run past its end.
 */
export function lastDigitYear(digit: number, now: Date = new Date()): number | null {
	if (!Number.isInteger(digit) || digit < 0 || digit > 9) return null;
	const limit = now.getUTCFullYear();
	const candidate = Math.floor(limit / 10) * 10 + digit;
	return candidate <= limit ? candidate : candidate - 10;
}
