/**
 * TCDD (Turkish State Railways) e-ticket barcodes.
 *
 * A "$"-delimited ASCII record beginning with "TCDD_B". Field meanings were
 * derived by comparing barcodes against their printed tickets; unrecognised
 * positions are kept in `extraFields` rather than guessed at.
 */

export interface TcddTicket {
	ticketNumber: string;
	pnr: string;
	/** ISO local departure date-time */
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
	return STATIONS[code] ?? `Station ${code}`;
}

/** yyyymmddHHMMSS or yyyymmddHHMM to an ISO local string. */
function toIso(value: string): string | null {
	const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
	if (!m) return null;
	return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

export function isTcdd(data: Uint8Array): boolean {
	if (data.length < 20) return false;
	for (const b of data) if (b < 0x20 || b > 0x7e) return false;
	return new TextDecoder().decode(data).startsWith('TCDD_');
}

export function parseTcdd(data: Uint8Array): TcddTicket {
	const fields = new TextDecoder().decode(data).split('$');
	if (fields.length < 21) throw new Error('truncated TCDD record');

	const money = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? v : null);
	const last = fields[fields.length - 1];

	return {
		ticketNumber: fields[4] ?? '',
		pnr: fields[5] ?? '',
		departure: toIso(fields[6] ?? ''),
		purchased: toIso(fields[20] ?? ''),
		trainNumber: fields[11] ?? '',
		originCode: fields[12] ?? '',
		destinationCode: fields[13] ?? '',
		coach: fields[15] ?? '',
		seat: fields[16] ?? '',
		price: money(fields[18]),
		fullPrice: money(fields[19]),
		checksum: /^[0-9a-f]{40}$/.test(last) ? last : null,
		// positions whose meaning is not established
		extraFields: [fields[7], fields[8], fields[9], fields[10], fields[14], fields[17], fields[25]].filter(
			(f): f is string => !!f && f !== 'null'
		)
	};
}
