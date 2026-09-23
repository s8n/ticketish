// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * TCDD (Turkish State Railways) e-ticket barcodes.
 *
 * A "$"-delimited ASCII record. Two layouts exist:
 *
 *   TCDD_B$6$3$0$<ticket>$<pnr>$<departure>$...    older tickets
 *   $TCDD_B$tcddprod$<ticket>$<pnr>$<departure>$... newer ones, note the
 *                                                  leading separator
 *
 * They share almost nothing beyond the magic, so the fields are read per
 * layout. Meanings were established by comparing barcodes against their
 * printed tickets; positions that could not be confirmed are kept in
 * `extraFields` rather than guessed at.
 *
 * The two layouts also number stations differently: the older one uses the
 * 9 digit ids of the retired api-yebsp backend, the newer one the small ids
 * of the current one. See stations.ts.
 */
import { ascii, isPrintableAscii } from '../bytes.ts';
import { calendarDate } from '../dates.ts';

export type TcddVariant = 'classic' | 'tcddprod';

export interface TcddTicket {
	variant: TcddVariant;
	ticketNumber: string;
	pnr: string;
	/** ISO local departure date-time; the newer layout may zero the time. */
	departure: string | null;
	/** ISO local purchase date-time */
	purchased: string | null;
	trainNumber: string;
	originCode: string;
	destinationCode: string;
	coach: string;
	seat: string;
	price: string | null;
	fullPrice: string | null;
	/** SHA-1 style integrity hash at the end of the record */
	checksum: string | null;
	extraFields: string[];
}

/**
 * yyyymmddHHMMSS or yyyymmddHHMM to an ISO local string. `zeroIsNoTime` is
 * for the one field that writes a zeroed time to mean it has none, the newer
 * layout's departure; anywhere else 00:00 is a time like any other.
 */
function toIso(value: string, zeroIsNoTime = false): string | null {
	const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
	if (!m) return null;
	const date = calendarDate(+m[1], +m[2], +m[3]);
	if (date === null || +m[4] > 23 || +m[5] > 59) return null;
	const zeroed = m[4] === '00' && m[5] === '00' && (m[6] ?? '00') === '00';
	const time = zeroIsNoTime && zeroed ? '' : `T${m[4]}:${m[5]}`;
	return `${date}${time}`;
}

const money = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? v : null);

/** Both layouts print the train as "<number>-<DDMMYYYY>". */
const trainOf = (value: string | undefined) => (value ?? '').split('-')[0] ?? '';

/** The record's fields, or null when it is not a TCDD record at all. */
function fieldsOf(data: Uint8Array): string[] | null {
	if (data.length < 20 || !isPrintableAscii(data)) return null;
	const fields = ascii(data).split('$');
	// the newer layout opens with the separator, so the magic can be second
	const magic = fields[0].startsWith('TCDD_') || fields[1]?.startsWith('TCDD_') === true;
	return magic ? fields : null;
}

export const isTcdd = (data: Uint8Array) => fieldsOf(data) !== null;

export function parseTcdd(data: Uint8Array): TcddTicket {
	const fields = fieldsOf(data);
	if (!fields) throw new Error('not a TCDD record');
	const magic = fields[0].startsWith('TCDD_') ? 0 : 1;
	/** Field `i` counted from the magic, which the newer layout puts second. */
	const field = (i: number) => fields[magic + i] ?? '';
	const last = fields[fields.length - 1];
	const checksum = /^[0-9a-f]{40}$/.test(last) ? last : null;

	// "tcddprod" in the slot the older layout uses for a version digit
	const variant: TcddVariant = /^\d+$/.test(field(1)) ? 'classic' : 'tcddprod';

	if (variant === 'classic') {
		if (fields.length < 21) throw new Error('truncated TCDD record');
		return {
			variant,
			ticketNumber: field(4),
			pnr: field(5),
			departure: toIso(field(6)),
			purchased: toIso(field(20)),
			trainNumber: trainOf(field(11)),
			originCode: field(12),
			destinationCode: field(13),
			coach: field(15),
			seat: field(16),
			price: money(field(18)),
			fullPrice: money(field(19)),
			checksum,
			extraFields: [field(7), field(8), field(9), field(10), field(14), field(17), field(25)].filter(
				(v) => v && v !== 'null'
			)
		};
	}

	if (fields.length < 18) throw new Error('truncated TCDD record');
	return {
		variant,
		ticketNumber: field(2),
		pnr: field(3),
		departure: toIso(field(4), true),
		purchased: toIso(field(15)),
		// the train and its date share a field, as on the printed ticket
		trainNumber: trainOf(field(8)),
		// station ids in the current backend's numbering, not the 9 digit ids
		// the older layout uses
		originCode: field(9),
		destinationCode: field(10),
		// no field here matches the printed car, so none is claimed as one
		coach: '',
		seat: field(13),
		price: money(field(14)),
		fullPrice: null,
		checksum,
		extraFields: [field(1), field(5), field(6), field(7), field(11), field(12), field(16), field(17)].filter(
			(v) => v && v !== 'null'
		)
	};
}
