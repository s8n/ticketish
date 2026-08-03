// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Normalized display model built from decoded FCB (U_FLEX) data.
 * Handles the version differences between FCB 1.3 / 2 / 3 that matter for
 * display, most importantly resolving day-offset fields against the issuing
 * date - which is how the DB Zugbindung (train binding) is deciphered.
 */
import type { Choice } from './asn1/index.ts';
import { isUicCodeTable, uicStationName, type StationTable } from './stations.ts';

export interface FcbIssuingDetail {
	issuingYear: number;
	issuingDay: number;
	issuingTime?: number;
	issuerNum?: number;
	issuerIA5?: string;
	issuerName?: string;
	securityProviderNum?: number;
	specimen?: boolean;
	activated?: boolean;
	currency?: string;
	issuerPNR?: string;
	[k: string]: unknown;
}

export interface FcbTicket {
	issuingDetail: FcbIssuingDetail;
	travelerDetail?: {
		traveler?: Traveler[];
		groupName?: string;
	};
	transportDocument?: { ticket: Choice }[];
	[k: string]: unknown;
}

export interface Traveler {
	firstName?: string;
	secondName?: string;
	lastName?: string;
	idCard?: string;
	passportId?: string;
	title?: string;
	yearOfBirth?: number;
	monthOfBirth?: number;
	dayOfBirthInMonth?: number;
	dayOfBirth?: number;
	passengerType?: string;
	[k: string]: unknown;
}

export interface TrainBinding {
	train: string;
	departureDate: string; // YYYY-MM-DD (local at departure station)
	departureTime: string; // HH:MM
	fromStation?: string;
	toStation?: string;
}

export interface DocumentSummary {
	type: string; // openTicket | reservation | pass | ...
	data: Record<string, unknown>;
	trainBindings: TrainBinding[];
	validFrom?: string; // ISO local date-time
	validUntil?: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Date of issue as UTC calendar parts (FCB dates are day-of-year based). */
export function issuingDate(issuing: FcbIssuingDetail): Date {
	const d = new Date(Date.UTC(issuing.issuingYear, 0, 1));
	d.setUTCDate(d.getUTCDate() + issuing.issuingDay - 1);
	return d;
}

function offsetDate(base: Date, days: number): string {
	const d = new Date(base);
	d.setUTCDate(d.getUTCDate() + days);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Absolute FCB date: a year plus a day of that year (1.1. = 1). Customer
 * cards use this rather than the offsets the other documents carry. The day
 * is optional, in which case only the year is known.
 */
function yearDay(year: number | undefined, day: number | undefined): string | undefined {
	if (year === undefined) return undefined;
	if (!day) return String(year);
	const d = new Date(Date.UTC(year, 0, 1));
	d.setUTCDate(d.getUTCDate() + day - 1);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function minutes(m: number): string {
	return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

function dateTime(base: Date, days: number | undefined, mins: number | undefined): string | undefined {
	if (days === undefined && mins === undefined) return undefined;
	const date = offsetDate(base, days ?? 0);
	return mins !== undefined ? `${date}T${minutes(mins)}` : date;
}

interface TrainLink {
	trainNum?: number;
	trainIA5?: string;
	travelDate: number;
	departureTime: number;
	fromStationNum?: number;
	fromStationIA5?: string;
	toStationNum?: number;
	toStationIA5?: string;
	fromStationNameUTF8?: string;
	toStationNameUTF8?: string;
	stationCodeTable?: string;
}

function trainLinkBinding(
	link: TrainLink,
	issued: Date,
	doc: Record<string, unknown>,
	stations: StationTable | null
): TrainBinding {
	const named = (num: number | undefined, table: string | undefined) =>
		isUicCodeTable(table) ? (uicStationName(stations, num) ?? numStr(num)) : numStr(num);
	// A trainLink numbers its own stations in its own code table; falling back
	// to the document's stations means falling back to the document's too.
	const linkTable = link.stationCodeTable;
	const docTable = doc.stationCodeTable as string | undefined;
	return {
		train: link.trainIA5 ?? (link.trainNum !== undefined ? String(link.trainNum) : '?'),
		departureDate: offsetDate(issued, link.travelDate),
		departureTime: minutes(link.departureTime),
		// A trainLink without its own stations binds the document's full route.
		fromStation:
			link.fromStationNameUTF8 ??
			link.fromStationIA5 ??
			named(link.fromStationNum, linkTable) ??
			((doc.fromStationNameUTF8 as string) ??
				named(doc.fromStationNum as number, docTable)),
		toStation:
			link.toStationNameUTF8 ??
			link.toStationIA5 ??
			named(link.toStationNum, linkTable) ??
			((doc.toStationNameUTF8 as string) ?? named(doc.toStationNum as number, docTable))
	};
}

function numStr(n: number | undefined): string | undefined {
	return n === undefined ? undefined : String(n);
}

/**
 * Extract per-document summaries (incl. Zugbindung) from a decoded FCB ticket.
 *
 * `stations` is the UIC name table, which loads on demand: pass null and the
 * numeric codes are shown instead, which is what the caller renders until it
 * arrives.
 */
export function summarizeFcb(
	ticket: FcbTicket,
	stations: StationTable | null = null
): DocumentSummary[] {
	const issued = issuingDate(ticket.issuingDetail);
	const docs = ticket.transportDocument ?? [];
	return docs.map((doc) => {
		const choice = doc.ticket;
		const type = choice.__choice__;
		const data = (choice.value ?? {}) as Record<string, unknown>;
		const bindings: TrainBinding[] = [];
		let validFrom: string | undefined;
		let validUntil: string | undefined;

		if (type === 'openTicket' || type === 'pass') {
			validFrom = dateTime(issued, data.validFromDay as number, data.validFromTime as number);
			if (data.validUntilDay !== undefined || data.validUntilTime !== undefined) {
				// validUntilDay counts from the valid-from date
				const fromDays = (data.validFromDay as number) ?? 0;
				validUntil = dateTime(
					issued,
					fromDays + ((data.validUntilDay as number) ?? 0),
					data.validUntilTime as number
				);
			}
			const region = (data.validRegion ?? []) as Choice[];
			for (const r of region) {
				if (r.__choice__ === 'trainLink')
					bindings.push(trainLinkBinding(r.value as TrainLink, issued, data, stations));
			}
		} else if (type === 'reservation') {
			const dep = dateTime(issued, (data.departureDate as number) ?? 0, data.departureTime as number);
			validFrom = dep;
			if (data.arrivalTime !== undefined) {
				validUntil = dateTime(
					issued,
					((data.departureDate as number) ?? 0) + ((data.arrivalDate as number) ?? 0),
					data.arrivalTime as number
				);
			}
			const train = (data.trainIA5 as string) ?? numStr(data.trainNum as number);
			if (train && dep) {
				const uic = isUicCodeTable(data.stationCodeTable as string | undefined);
				const named = (num: number | undefined) =>
					uic ? (uicStationName(stations, num) ?? numStr(num)) : numStr(num);
				bindings.push({
					train,
					departureDate: dep.slice(0, 10),
					departureTime: dep.slice(11) || '',
					fromStation:
						(data.fromStationNameUTF8 as string) ??
						(data.fromStationIA5 as string) ??
						named(data.fromStationNum as number),
					toStation:
						(data.toStationNameUTF8 as string) ??
						(data.toStationIA5 as string) ??
						named(data.toStationNum as number)
				});
			}
		} else if (type === 'customerCard') {
			// Cards date themselves absolutely instead of counting from the
			// issuing date, and validUntilYear counts from the valid-from year.
			const fromYear = data.validFromYear as number;
			validFrom = yearDay(fromYear, data.validFromDay as number);
			validUntil = yearDay(
				fromYear === undefined ? undefined : fromYear + ((data.validUntilYear as number) ?? 0),
				data.validUntilDay as number
			);
		}

		return { type, data, trainBindings: bindings, validFrom, validUntil };
	});
}

/** All train bindings (Zugbindung) across a ticket's documents. */
export function zugbindung(
	ticket: FcbTicket,
	stations: StationTable | null = null
): TrainBinding[] {
	return summarizeFcb(ticket, stations).flatMap((d) => d.trainBindings);
}
