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

export function vdvDateTime(data: Uint8Array): string | null {
	if (data.length < 4) return null;
	const packed = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
	if (packed === 0) return null;
	const year = 1990 + (packed >>> 25);
	const month = (packed >>> 21) & 0xf;
	const day = (packed >>> 16) & 0x1f;
	const hour = (packed >>> 11) & 0x1f;
	const minute = (packed >>> 5) & 0x3f;
	const second = (packed & 0x1f) * 2;
	const date = new Date(Date.UTC(year, month - 1, day + Math.floor(hour / 24)));
	return `${isoDate(date)}T${pad(hour % 24)}:${pad(minute)}:${pad(second)}`;
}
