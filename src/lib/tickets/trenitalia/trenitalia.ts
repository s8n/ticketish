/**
 * Trenitalia barcodes.
 *
 * A 67-byte bit-packed payload that opens with an SSB-style header (version,
 * RICS, key id, ticket type 16). The body is not the standard SSB layout and
 * no public specification was available, so the offsets below are the ones
 * confirmed by cross-checking a real barcode against its printed ticket:
 * train number, seat, PNR and entitlement number. Everything else (dates,
 * times, coach, stations) stays undecoded rather than guessed.
 */

const ALPHABET: Record<number, string> = (() => {
	const map: Record<number, string> = {};
	for (let i = 0; i < 10; i++) map[i] = String(i);
	for (let i = 0; i < 26; i++) map[10 + i] = String.fromCharCode(65 + i);
	map[36] = ' ';
	map[63] = '?';
	return map;
})();

function bit(d: Uint8Array, i: number): number {
	return (d[i >> 3] >> (7 - (i & 7))) & 1;
}

function int(d: Uint8Array, start: number, end: number): number {
	let v = 0;
	for (let i = start; i < end; i++) v = v * 2 + bit(d, i);
	return v;
}

function str(d: Uint8Array, start: number, end: number): string {
	let s = '';
	for (let i = start; i < end; i += 6) s += ALPHABET[int(d, i, i + 6)] ?? ' ';
	return s.trim();
}

export interface TrenitaliaTicket {
	version: number;
	issuerRics: number;
	ticketType: number;
	trainNumber: number;
	seat: string;
	pnr: string;
	entitlementNumber: number;
	/** Fields this format has that are not decoded yet. */
	partial: true;
}

export function isTrenitalia(data: Uint8Array): boolean {
	if (data.length !== 67) return false;
	const version = (data[0] >> 4) & 0x0f;
	if (version !== 2) return false;
	// RICS 83 is Trenitalia; the ticket type of this variant is 16
	return int(data, 4, 18) === 83 && int(data, 22, 27) === 16;
}

export function parseTrenitalia(data: Uint8Array): TrenitaliaTicket {
	if (!isTrenitalia(data)) throw new Error('not a Trenitalia barcode');
	return {
		version: int(data, 0, 4),
		issuerRics: int(data, 4, 18),
		ticketType: int(data, 22, 27),
		trainNumber: int(data, 177, 194),
		seat: str(data, 251, 263),
		pnr: str(data, 270, 306),
		entitlementNumber: int(data, 468, 500),
		partial: true
	};
}
