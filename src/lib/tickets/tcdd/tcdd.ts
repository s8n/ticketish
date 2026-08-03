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
 */

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

const STATIONS: Record<string, string> = {
	'234516259': 'Ankara Gar',
	'234516104': 'İstanbul (Pendik)'
};

export function tcddStationName(code: string): string {
	if (!code) return '';
	return STATIONS[code] ?? `Station ${code}`;
}

/** yyyymmddHHMMSS or yyyymmddHHMM to an ISO local string. */
function toIso(value: string): string | null {
	const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
	if (!m) return null;
	const time = m[4] === '00' && m[5] === '00' && (m[6] ?? '00') === '00' ? '' : `T${m[4]}:${m[5]}`;
	return `${m[1]}-${m[2]}-${m[3]}${time}`;
}

const money = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? v : null);

/** Both layouts print the train as "<number>-<DDMMYYYY>". */
const trainOf = (value: string | undefined) => (value ?? '').split('-')[0] ?? '';

export function isTcdd(data: Uint8Array): boolean {
	if (data.length < 20) return false;
	for (const b of data) if (b < 0x20 || b > 0x7e) return false;
	const fields = new TextDecoder().decode(data).split('$');
	// the newer layout opens with the separator, so the magic can be second
	return fields[0].startsWith('TCDD_') || fields[1]?.startsWith('TCDD_') === true;
}

export function parseTcdd(data: Uint8Array): TcddTicket {
	const fields = new TextDecoder().decode(data).split('$');
	const magic = fields[0].startsWith('TCDD_') ? 0 : 1;
	const f = (i: number) => fields[magic + i] ?? '';
	const last = fields[fields.length - 1];
	const checksum = /^[0-9a-f]{40}$/.test(last) ? last : null;

	// "tcddprod" in the slot the older layout uses for a version digit
	const variant: TcddVariant = /^\d+$/.test(f(1)) ? 'classic' : 'tcddprod';

	if (variant === 'classic') {
		if (fields.length < 21) throw new Error('truncated TCDD record');
		return {
			variant,
			ticketNumber: f(4),
			pnr: f(5),
			departure: toIso(f(6)),
			purchased: toIso(f(20)),
			trainNumber: trainOf(f(11)),
			originCode: f(12),
			destinationCode: f(13),
			coach: f(15),
			seat: f(16),
			price: money(f(18)),
			fullPrice: money(f(19)),
			checksum,
			extraFields: [f(7), f(8), f(9), f(10), f(14), f(17), f(25)].filter(
				(v) => v && v !== 'null'
			)
		};
	}

	if (fields.length < 18) throw new Error('truncated TCDD record');
	return {
		variant,
		ticketNumber: f(2),
		pnr: f(3),
		departure: toIso(f(4)),
		purchased: toIso(f(15)),
		// the train and its date share a field, as on the printed ticket
		trainNumber: trainOf(f(8)),
		// this layout carries no station codes that could be identified
		originCode: '',
		destinationCode: '',
		// nor a coach: the only plausible field disagreed with the printed car
		coach: '',
		seat: f(13),
		price: money(f(14)),
		fullPrice: null,
		checksum,
		extraFields: [f(1), f(5), f(6), f(7), f(9), f(10), f(11), f(12), f(16), f(17)].filter(
			(v) => v && v !== 'null'
		)
	};
}
