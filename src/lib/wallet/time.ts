// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Times on a pass. The formats carry wall clocks and, now and then, an offset;
 * the pass writers need them as the parts and instants each platform takes.
 */
import { pad } from '../tickets/dates.ts';

/**
 * FCB's UTC offset as minutes east of UTC.
 *
 * The field counts quarter hours and runs the other way: the spec defines it
 * as `UTC = local + offset * 15 minutes`, so a German summer departure is
 * written -8 and means UTC+2. It is the only zone information any of these
 * formats carries, which is why every time in this model is otherwise a bare
 * wall clock.
 */
export function fcbUtcOffset(value: number | undefined): number | undefined {
	// subtracted rather than negated, so UTC itself comes out as 0 and not -0
	return typeof value === 'number' ? 0 - value * 15 : undefined;
}

/** Minutes east of UTC as "+02:00", the way every standard here writes it. */
export function utcOffsetLabel(minutes: number): string {
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(minutes);
	return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * An ISO local date-time as the parts a pass writer needs. Returns null for
 * anything that is not a date, so a half-filled field cannot become a wrong
 * timestamp.
 */
export function localParts(
	value: string | undefined
): { date: string; time: string | null } | null {
	if (!value) return null;
	const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/);
	return m ? { date: m[1], time: m[2] ?? null } : null;
}

/** The parts as a full local date-time, midnight where there is no time. */
export const localDateTime = (parts: { date: string; time: string | null }) =>
	`${parts.date}T${parts.time ?? '00:00'}:00`;

/**
 * The same value as an ISO 8601 instant.
 *
 * With an offset this is exact: the ticket said when, in a zone, and the
 * moment follows. Without one it is a guess, and reading the wall clock as
 * UTC is the guess that never moves a displayed time, since a wallet showing
 * an instant with a zero offset prints the hour the ticket printed. The cost
 * of the guess is that a relevance notification can fire at the wrong local
 * hour, which is why the visible fields carry the wall clock rather than
 * letting the platform format the instant.
 */
export function asUtcInstant(value: string | undefined, offsetMinutes?: number): string | null {
	const parts = localParts(value);
	if (!parts) return null;
	const local = localDateTime(parts);
	if (offsetMinutes === undefined) return `${local}Z`;
	const instant = Date.parse(`${local}Z`) - offsetMinutes * 60_000;
	return new Date(instant).toISOString().replace(/\.\d+Z$/, 'Z');
}
