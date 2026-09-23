// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Normalized display model built from decoded FCB (U_FLEX) data.
 * Handles the version differences between FCB 1.3 / 2 / 3 that matter for
 * display, most importantly resolving day-offset fields against the issuing
 * date - which is how the DB Zugbindung (train binding) is deciphered.
 */
import type { Choice } from './asn1/index.ts';
import { dayOfYearDate, dayOfYearUtc, isoDate, plusDays, timeOfDay } from './dates.ts';
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

/**
 * One transport document as the decoder returns it: whichever of the FCB
 * document types it is, as a plain object keyed by the schema's field names.
 *
 * The fields listed are the ones read by name here and in the wallet mapping,
 * typed as the schema defines them, so a renamed field is a type error rather
 * than an undefined. Everything else a document carries is still there, for
 * the views that lay out all of it.
 */
export interface FcbDocument {
	stationCodeTable?: string;
	fromStationNum?: number;
	fromStationIA5?: string;
	fromStationNameUTF8?: string;
	toStationNum?: number;
	toStationIA5?: string;
	toStationNameUTF8?: string;
	validRegion?: Choice[];
	validRegionDesc?: string;
	/** Days counted from the issuing date, and minutes into the day. */
	validFromDay?: number;
	validFromTime?: number;
	validFromUTCOffset?: number;
	/** Days counted from the valid-from date. */
	validUntilDay?: number;
	validUntilTime?: number;
	validUntilUTCOffset?: number;
	/** A customer card's absolute year, and its end as years after it. */
	validFromYear?: number;
	validUntilYear?: number;
	departureDate?: number;
	departureTime?: number;
	departureUTCOffset?: number;
	arrivalDate?: number;
	arrivalTime?: number;
	arrivalUTCOffset?: number;
	trainNum?: number;
	trainIA5?: string;
	classCode?: string;
	price?: number;
	productIdIA5?: string;
	serviceBrandNameUTF8?: string;
	serviceBrandAbrUTF8?: string;
	referenceIA5?: string;
	referenceNum?: number;
	[k: string]: unknown;
}

export interface DocumentSummary {
	type: string; // openTicket | reservation | pass | ...
	data: FcbDocument;
	trainBindings: TrainBinding[];
	validFrom?: string; // ISO local date-time
	validUntil?: string;
}

/** Date of issue as UTC calendar parts (FCB dates are day-of-year based). */
export function issuingDate(issuing: FcbIssuingDetail): Date {
	return dayOfYearUtc(issuing.issuingYear, issuing.issuingDay);
}

const offsetDate = (base: Date, days: number) => isoDate(plusDays(base, days));

/**
 * Absolute FCB date: a year plus a day of that year (1.1. = 1). Customer
 * cards use this rather than the offsets the other documents carry. The day
 * is optional, in which case only the year is known.
 */
function yearDay(year: number | undefined, day: number | undefined): string | undefined {
	if (year === undefined) return undefined;
	if (!day) return String(year);
	return dayOfYearDate(year, day) ?? String(year);
}

function dateTime(base: Date, days: number | undefined, mins: number | undefined): string | undefined {
	if (days === undefined && mins === undefined) return undefined;
	const date = offsetDate(base, days ?? 0);
	return mins !== undefined ? `${date}T${timeOfDay(mins)}` : date;
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
	doc: FcbDocument,
	stations: StationTable | null
): TrainBinding {
	const named = (num: number | undefined, table: string | undefined) =>
		isUicCodeTable(table) ? (uicStationName(stations, num) ?? numStr(num)) : numStr(num);
	// A trainLink numbers its own stations in its own code table; falling back
	// to the document's stations means falling back to the document's too.
	const linkTable = link.stationCodeTable;
	const docTable = doc.stationCodeTable;
	return {
		train: link.trainIA5 ?? (link.trainNum !== undefined ? String(link.trainNum) : '?'),
		departureDate: offsetDate(issued, link.travelDate),
		departureTime: timeOfDay(link.departureTime),
		// A trainLink without its own stations binds the document's full route.
		fromStation:
			link.fromStationNameUTF8 ??
			link.fromStationIA5 ??
			named(link.fromStationNum, linkTable) ??
			doc.fromStationNameUTF8 ??
			named(doc.fromStationNum, docTable),
		toStation:
			link.toStationNameUTF8 ??
			link.toStationIA5 ??
			named(link.toStationNum, linkTable) ??
			doc.toStationNameUTF8 ??
			named(doc.toStationNum, docTable)
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
		// the one place the decoder's untyped value meets the named fields
		const data = (choice.value ?? {}) as FcbDocument;
		const bindings: TrainBinding[] = [];
		let validFrom: string | undefined;
		let validUntil: string | undefined;

		if (type === 'openTicket' || type === 'pass') {
			validFrom = dateTime(issued, data.validFromDay, data.validFromTime);
			if (data.validUntilDay !== undefined || data.validUntilTime !== undefined) {
				// validUntilDay counts from the valid-from date
				const fromDays = data.validFromDay ?? 0;
				validUntil = dateTime(issued, fromDays + (data.validUntilDay ?? 0), data.validUntilTime);
			}
			const region = data.validRegion ?? [];
			for (const r of region) {
				if (r.__choice__ === 'trainLink')
					bindings.push(trainLinkBinding(r.value as TrainLink, issued, data, stations));
			}
		} else if (type === 'reservation') {
			const dep = dateTime(issued, data.departureDate ?? 0, data.departureTime);
			validFrom = dep;
			if (data.arrivalTime !== undefined) {
				validUntil = dateTime(
					issued,
					(data.departureDate ?? 0) + (data.arrivalDate ?? 0),
					data.arrivalTime
				);
			}
			const train = data.trainIA5 ?? numStr(data.trainNum);
			if (train && dep) {
				const uic = isUicCodeTable(data.stationCodeTable);
				const named = (num: number | undefined) =>
					uic ? (uicStationName(stations, num) ?? numStr(num)) : numStr(num);
				bindings.push({
					train,
					departureDate: dep.slice(0, 10),
					departureTime: dep.slice(11) || '',
					fromStation:
						data.fromStationNameUTF8 ?? data.fromStationIA5 ?? named(data.fromStationNum),
					toStation:
						data.toStationNameUTF8 ?? data.toStationIA5 ?? named(data.toStationNum)
				});
			}
		} else if (type === 'customerCard') {
			// Cards date themselves absolutely instead of counting from the
			// issuing date, and validUntilYear counts from the valid-from year.
			const fromYear = data.validFromYear;
			validFrom = yearDay(fromYear, data.validFromDay);
			validUntil = yearDay(
				fromYear === undefined ? undefined : fromYear + (data.validUntilYear ?? 0),
				data.validUntilDay
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
