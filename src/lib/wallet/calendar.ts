// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The trip as a calendar entry.
 *
 * Same mapping as the passes, a third thing to do with it. A pass is for the
 * barrier; this is for the part of a ticket that is really an appointment,
 * and it is the one export that survives having no wallet, no developer
 * account and no phone in particular.
 *
 * Times are written as RFC 5545 floating date-times: no Z, no TZID. That is
 * not a shortcut, it is the honest encoding of what these formats carry.
 * None of them says which zone its wall clock is in, and a floating time is
 * defined to mean the same wall clock wherever it is read, which is exactly
 * the claim the ticket makes. Pinning it to UTC would show a German
 * departure an hour or two out to the person holding it.
 *
 * The UID is derived from the payload, the way the pass serial number is, so
 * adding the same ticket twice updates one entry rather than making two.
 */
import { isoDate, plusDays } from '../tickets/dates.ts';
import { localParts, tripTitle, APP_NAME, UNOFFICIAL_NOTE, type TripSummary } from './trip.ts';

/** Why this trip cannot become an event, or null when it can. */
export function calendarProblem(trip: TripSummary): string | null {
	if (!localParts(trip.departure ?? trip.validFrom)) {
		return 'this ticket does not say when it is for';
	}
	return null;
}

const escape = (value: string) =>
	value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');

/**
 * Fold a content line to 75 octets, as the standard requires, counting bytes
 * rather than characters: a station name with an umlaut in it is two octets
 * where the fold cares and one where the string does.
 */
function fold(line: string): string[] {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return [line];

	const out: string[] = [];
	let current = '';
	let bytes = 0;
	// a continuation line starts with a space, which counts toward its 75
	let limit = 75;
	for (const character of line) {
		const size = encoder.encode(character).length;
		if (bytes + size > limit) {
			out.push(current);
			current = '';
			bytes = 0;
			limit = 74;
		}
		current += character;
		bytes += size;
	}
	if (current) out.push(current);
	return out.map((part, i) => (i === 0 ? part : ` ${part}`));
}

/** A local wall clock as a floating date-time, or a date as a plain date. */
function stamp(value: string | undefined): { date: string; floating: string | null } | null {
	const parts = localParts(value);
	if (!parts) return null;
	const date = parts.date.replace(/-/g, '');
	return { date, floating: parts.time ? `${date}T${parts.time.replace(':', '')}00` : null };
}

const utcStamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

/** The day after a compact YYYYMMDD, for an all-day event's exclusive end. */
function dayAfter(compact: string): string {
	const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
	return isoDate(plusDays(new Date(`${iso}T00:00:00Z`), 1)).replace(/-/g, '');
}

export interface IcsInput {
	trip: TripSummary;
	/** Stable per ticket, so a second import updates rather than duplicates. */
	uid: string;
	/** When the file was written. A parameter so a test can produce it twice. */
	now?: Date;
}

/**
 * The event, as an .ics file.
 *
 * A journey is a timed event from its departure to its arrival. A journey
 * with no arrival in the barcode gets no end rather than an invented one: the
 * standard reads that as an instant, which is closer to true than a duration
 * nobody told us. A period ticket becomes an all-day event across its
 * validity, with the end pushed a day out because DTEND is exclusive.
 */
export function buildIcs({ trip, uid, now = new Date() }: IcsInput): string {
	const problem = calendarProblem(trip);
	if (problem) throw new Error(problem);

	// The two ends have to come from the same pair. A journey runs from its
	// departure to its arrival; a period ticket runs across its validity.
	// Crossing them makes a train that departs on time and arrives when the
	// ticket expires, which for a day ticket is most of a day.
	const [from, to] = trip.departure
		? [trip.departure, trip.arrival]
		: [trip.validFrom, trip.validUntil];
	const start = stamp(from)!;
	const end = stamp(to);

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:-//${APP_NAME}//rail ticket//EN`,
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escape(uid)}`,
		`DTSTAMP:${utcStamp(now)}`
	];

	if (start.floating) {
		lines.push(`DTSTART:${start.floating}`);
		// an end before the start is not an event, so it is left out rather
		// than written backwards
		if (end?.floating && end.floating >= start.floating) {
			lines.push(`DTEND:${end.floating}`);
		}
	} else {
		lines.push(`DTSTART;VALUE=DATE:${start.date}`);
		// DTEND is exclusive on an all-day event: the last valid day is the
		// day before the one written here
		lines.push(`DTEND;VALUE=DATE:${dayAfter(end?.date ?? start.date)}`);
	}

	lines.push(`SUMMARY:${escape(summary(trip))}`);
	if (trip.from) lines.push(`LOCATION:${escape(trip.from)}`);
	lines.push(`DESCRIPTION:${escape(description(trip))}`);
	lines.push('END:VEVENT', 'END:VCALENDAR');

	return lines.flatMap(fold).join('\r\n') + '\r\n';
}

/** "Mannheim to Reutlingen (ICE573)", or the product for a period ticket. */
function summary(trip: TripSummary): string {
	const title = tripTitle(trip);
	return trip.train ? `${title} (${trip.train})` : title;
}

/** Everything else the mapping found, one labelled line each. */
function description(trip: TripSummary): string {
	const rows: [string, string | undefined][] = [
		['Operator', trip.issuer],
		['Ticket', trip.product],
		['Class', trip.travelClass],
		['Coach', trip.coach],
		['Seat', trip.seat],
		['Passenger', trip.passenger],
		['Route', trip.via],
		['Valid from', trip.validFrom?.replace('T', ' ')],
		['Valid until', trip.validUntil?.replace('T', ' ')],
		['Ticket number', trip.ticketId],
		['Booking reference', trip.reference],
		['Price', trip.price]
	];
	const filled = rows.filter(([, value]) => !!value).map(([label, value]) => `${label}: ${value}`);
	return [...filled, '', UNOFFICIAL_NOTE].join('\n');
}

export const ICS_MIME = 'text/calendar';

/** A file name that says what the event is, matching the pass naming. */
export function icsFileName(trip: TripSummary): string {
	const base = tripTitle(trip)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `${base || 'ticket'}.ics`;
}
