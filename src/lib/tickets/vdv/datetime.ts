// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The VDV-KA compact date-time, four bytes packed as
 * `yyyyyyym mmmddddd hhhhhmmm mmmsssss`: years since 1990, then month, day,
 * hour and minute, and seconds in two second steps, the way a DOS timestamp
 * counts them. Written from the layout, which the VDV barcode and DB's
 * 0080VU record share, so both read their times through this.
 *
 * All four bytes zero means no time was given. An hour past 23 means the
 * small hours of the day after, which is how a validity that ends after
 * midnight is written against the day it started.
 */
import { isoDate, pad } from '../dates.ts';

export function vdvDateTime(d: Uint8Array): string | null {
	if (d.length < 4) return null;
	const v = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
	if (v === 0) return null;
	const year = 1990 + (v >>> 25);
	const month = (v >>> 21) & 0xf;
	const day = (v >>> 16) & 0x1f;
	const hour = (v >>> 11) & 0x1f;
	const minute = (v >>> 5) & 0x3f;
	const second = (v & 0x1f) * 2;
	const date = new Date(Date.UTC(year, month - 1, day + Math.floor(hour / 24)));
	return `${isoDate(date)}T${pad(hour % 24)}:${pad(minute)}:${pad(second)}`;
}
