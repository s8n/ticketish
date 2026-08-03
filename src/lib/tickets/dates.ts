// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Date and time helpers for the formats that date themselves by day of the
 * year, that record only part of the year and leave the rest to be assumed,
 * or that count minutes from midnight.
 *
 * Everything here works in UTC. None of these formats carries a time zone, so
 * the calendar arithmetic is done somewhere without daylight saving and the
 * result is read as the wall clock the issuer wrote.
 */

export const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** The calendar date of a UTC `Date`, as YYYY-MM-DD. */
export const isoDate = (d: Date) =>
	`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** A day of the year as a UTC date. 1 January is day 1. */
export function dayOfYearUtc(year: number, dayOfYear: number): Date {
	const d = new Date(Date.UTC(year, 0, 1));
	d.setUTCDate(d.getUTCDate() + dayOfYear - 1);
	return d;
}

/** A date `days` later, which is how the offset fields count. */
export function plusDays(base: Date, days: number): Date {
	const d = new Date(base);
	d.setUTCDate(d.getUTCDate() + days);
	return d;
}

/**
 * A day of the year as an ISO date. 1 January is day 1. Day 366 of a common
 * year is rejected rather than rolled into the next one.
 */
export function dayOfYearDate(year: number, dayOfYear: number): string | null {
	if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
	const d = dayOfYearUtc(year, dayOfYear);
	if (d.getUTCFullYear() !== year) return null;
	return isoDate(d);
}

/**
 * Pick the year that puts a day of the year closest to the reference date.
 *
 * For the formats that record a day and no year at all. Unlike the last-digit
 * case below the value can date travel rather than issue, so it is free to
 * fall either side of today and the nearest candidate is the best guess.
 */
export function resolveDayOfYear(day: number, now: Date = new Date()): string | null {
	if (!Number.isInteger(day) || day < 1 || day > 366) return null;
	const year = now.getUTCFullYear();
	let best: Date | null = null;
	for (const candidate of [year - 1, year, year + 1]) {
		const date = dayOfYearUtc(candidate, day);
		if (!best || Math.abs(date.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())) {
			best = date;
		}
	}
	return best ? isoDate(best) : null;
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

/**
 * Minutes from midnight as HH:MM. Past a day it wraps, since the formats that
 * count this way use the overflow to mean the small hours of the next day and
 * date it separately.
 */
export function timeOfDay(minutes: number): string {
	return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}
