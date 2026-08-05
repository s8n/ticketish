// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Synthetic Renfe barcodes.
 *
 * The layout is fixed width printable ASCII, so a payload is built by writing
 * the fields at their offsets and padding the rest. Every value here is made
 * up: the station codes are ones the app's own table knows, the localizador is
 * not a booking, and the signature is a run of base64 characters rather than a
 * signature over anything.
 */

export const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

export interface RenfeParts {
	ticketNumber?: string;
	/** Five digits, as printed: "01071" is Renfe Viajeros' RICS code. */
	company?: string;
	train?: string;
	/** dd/mm/yyyy, which is how the long form writes it. */
	date?: string;
	time?: string;
	/** Seven digits each, which is how the long form pads a station code. */
	origin?: string;
	destination?: string;
	coach?: string;
	seat?: string;
	booking?: string;
	code?: string;
}

const DEFAULTS: Required<RenfeParts> = {
	ticketNumber: '7250000000001',
	company: '01071',
	train: '03112',
	date: '19/05/2024',
	time: '11:00',
	origin: '0071801',
	destination: '0060000',
	coach: '018',
	seat: '15B',
	booking: 'TESTAB',
	code: 'C3HGJ'
};

/** The short block, which Renfe also issues on its own as a QR code. */
export function renfeBlockB(parts: RenfeParts = {}): string {
	const p = { ...DEFAULTS, ...parts };
	const compact = p.date.slice(0, 2) + p.date.slice(3, 5) + p.date.slice(8, 10);
	// the region after the ticket number is not understood, so it is filled
	// with something plausible rather than claimed to be empty
	return `${p.ticketNumber}7180160000${compact}${p.train}${p.coach}${p.seat}010${p.booking}..${p.code}`;
}

/** The long Aztec form: block A, the short block, padding, signature, "~". */
export function renfeAztec(parts: RenfeParts = {}): Uint8Array {
	const p = { ...DEFAULTS, ...parts };
	const blockA =
		p.ticketNumber + p.company + p.train + p.date + p.time +
		p.origin + p.destination + p.coach + p.seat;
	const signature = 'MCwCFEojPU7IR9qyfwaehgZcZq8gQve4AhQ+5TQZ5asM+LxZwEIu5HeU9d3s4Q==';
	const body = blockA.padEnd(100, '0') + renfeBlockB(parts);
	return ascii(body.padEnd(416, '0') + signature + '~'.repeat(36));
}
