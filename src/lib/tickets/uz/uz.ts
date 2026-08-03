// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Ukrainian Railways (Укрзалізниця, UZ) boarding documents.
 *
 * The QR is plain UTF-8 text, one field per line, Cyrillic and all:
 *
 *   723 ОА ФІРМ ІС+                train and category
 *   (2204001) ХАРКІВ-ПАС           origin, station code then name
 *   (2200001) КИЇВ-ПАСАЖИРСЬКИЙ    destination
 *   01.07 13:15                    departure, with no year
 *   01.07 18:00                    arrival
 *   02 С/1 КЛ                      coach and class
 *   038 Повний                     seat and fare type
 *   ANDREW BRABIN                  passenger
 *   854.72                         fare in hryvnia
 *   000B3FC6-FBF85787-0001         document number
 *   59A3D90E72D8CDF8F02D320700771066   authentication code
 *
 * Every one of those was read off the printed face of the ticket it came
 * from, which prints the same values in the same order.
 *
 * Lines are classified by shape rather than counted off from the top. With a
 * single sample to go on, a fixed line index would be a guess about a layout
 * nothing here can check, whereas "(1234567) NAME" and "DD.MM HH:MM" and a
 * bare 32 hex digits are distinctive enough to find wherever they sit.
 * Anything left over is kept in `extra` rather than dropped.
 */

/** Station lines carry a seven digit code in brackets, then the name. */
const STATION = /^\((\d{7})\)\s*(.+)$/;
/** Departure and arrival, day and month only: the record carries no year. */
const DATE_TIME = /^(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/;
/** Coach, then its class, e.g. "02 С/1 КЛ". */
const COACH = /^(\d{1,3})\s+(\S.*)$/;
/** The fare, always with two decimals on the samples seen. */
const PRICE = /^(\d+)\.(\d{2})$/;
/** Document number, printed on the face in the same three groups. */
const DOCUMENT = /^[0-9A-F]{8}-[0-9A-F]{8}-\d{4}$/;
/** Authentication code. Not verified here, and there is nothing to verify it against. */
const AUTHENTICATION = /^[0-9A-F]{32}$/;
/** A row of dots the ticket uses as a separator. */
const SEPARATOR = /^\.+$/;

export interface UzStation {
	/** Seven digit UZ station code. */
	code: string;
	name: string;
}

export interface UzDateTime {
	day: number;
	month: number;
	/** HH:MM, local. The record carries no year and no zone. */
	time: string;
}

export interface UzTicket {
	/** Train number and category as one line, e.g. "723 ОА ФІРМ ІС+". */
	train: string | null;
	from: UzStation | null;
	to: UzStation | null;
	departure: UzDateTime | null;
	arrival: UzDateTime | null;
	/** Coach number, then its class. */
	coach: string | null;
	coachClass: string | null;
	/** Seat number, then the fare type it was sold at. */
	seat: string | null;
	fareType: string | null;
	passenger: string | null;
	/** Fare in kopiykas, so 85472 is 854.72 hryvnia. */
	price: number | null;
	documentNumber: string | null;
	authentication: string | null;
	/** Lines this parser does not place, blank ones dropped. */
	extra: string[];
}

function lines(data: Uint8Array): string[] | null {
	try {
		const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
		return text.split(/\r?\n/).map((l) => l.trim());
	} catch {
		return null;
	}
}

function dateTime(m: RegExpMatchArray): UzDateTime | null {
	const day = Number(m[1]);
	const month = Number(m[2]);
	const hour = Number(m[3]);
	const minute = Number(m[4]);
	if (day < 1 || day > 31 || month < 1 || month > 12) return null;
	if (hour > 23 || minute > 59) return null;
	return { day, month, time: `${m[3]}:${m[4]}` };
}

export function isUz(data: Uint8Array): boolean {
	const ls = lines(data);
	if (!ls) return false;
	// two station lines and a time is the shape nothing else here has
	const stations = ls.filter((l) => STATION.test(l)).length;
	const times = ls.filter((l) => DATE_TIME.test(l)).length;
	return stations >= 2 && times >= 1;
}

export function parseUz(data: Uint8Array): UzTicket {
	const ls = lines(data);
	if (!ls || !isUz(data)) throw new Error('not a UZ boarding document');

	const stations: UzStation[] = [];
	const times: UzDateTime[] = [];
	const unplaced: string[] = [];
	let price: number | null = null;
	let documentNumber: string | null = null;
	let authentication: string | null = null;

	for (const line of ls) {
		if (!line || SEPARATOR.test(line)) continue;

		const station = line.match(STATION);
		if (station) {
			stations.push({ code: station[1], name: station[2].trim() });
			continue;
		}
		const time = line.match(DATE_TIME);
		if (time) {
			const parsed = dateTime(time);
			if (parsed) {
				times.push(parsed);
				continue;
			}
		}
		if (DOCUMENT.test(line)) {
			documentNumber ??= line;
			continue;
		}
		if (AUTHENTICATION.test(line)) {
			authentication ??= line;
			continue;
		}
		const money = line.match(PRICE);
		if (money && price === null) {
			price = Number(money[1]) * 100 + Number(money[2]);
			continue;
		}
		unplaced.push(line);
	}

	// What is left, in order: the train, then coach and seat, then whoever is
	// travelling. The train line leads because it is the first thing printed.
	const [train = null, coachLine, seatLine, ...rest] = unplaced;
	const coach = coachLine?.match(COACH) ?? null;
	const seat = seatLine?.match(COACH) ?? null;

	return {
		train,
		from: stations[0] ?? null,
		to: stations[1] ?? null,
		departure: times[0] ?? null,
		arrival: times[1] ?? null,
		coach: coach?.[1] ?? null,
		coachClass: coach?.[2]?.trim() ?? null,
		seat: seat?.[1] ?? null,
		fareType: seat?.[2]?.trim() ?? null,
		passenger: rest[0] ?? null,
		price,
		documentNumber,
		authentication,
		extra: rest.slice(1)
	};
}
