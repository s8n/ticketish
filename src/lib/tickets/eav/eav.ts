// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * EAV / UNICO Campania tickets.
 *
 * The QR is plain text, one field per line:
 *
 *   DIFFERITO_EOD              ticket type
 *   EAV                        operator
 *   2024-05-19T10:00           valid from
 *   2024-05-19T23:59           valid until
 *   ABCDEFGH12                 PNR, printed on the ticket
 *   21 / 11 / 20               three numbers whose meaning is not established
 *   0a1b2c3d...                hex authentication code
 *   2024-05-19T10:00:42+02:00  time of sale
 *
 * Everything above bar the three numbers was confirmed against a printed
 * ticket. Those are kept as-is rather than guessed at. The values shown here
 * are invented.
 */

export interface EavTicket {
	ticketType: string;
	operator: string;
	validFrom: string | null;
	validUntil: string | null;
	pnr: string;
	/** Undecoded numeric fields, in the order they appear. */
	codes: string[];
	/** Hex authentication code; not verified. */
	authentication: string | null;
	soldAt: string | null;
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const HEX = /^[0-9a-f]{16,}$/i;

function lines(data: Uint8Array): string[] | null {
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(data);
	} catch {
		return null;
	}
	const parts = text.split('\n').map((l) => l.trim());
	// a trailing newline is normal, so drop only empty entries at the end
	while (parts.length && parts[parts.length - 1] === '') parts.pop();
	return parts;
}

export function isEav(data: Uint8Array): boolean {
	const parts = lines(data);
	if (!parts || parts.length < 9) return false;
	return (
		parts[1] === 'EAV' &&
		LOCAL_DATE_TIME.test(parts[2]) &&
		LOCAL_DATE_TIME.test(parts[3]) &&
		parts[4].length > 0
	);
}

export function parseEav(data: Uint8Array): EavTicket {
	const parts = lines(data);
	if (!parts || !isEav(data)) throw new Error('not an EAV ticket');

	const rest = parts.slice(5);
	const soldAt = rest.find((p) => ZONED_DATE_TIME.test(p)) ?? null;
	const authentication = rest.find((p) => HEX.test(p)) ?? null;
	const codes = rest.filter((p) => p !== soldAt && p !== authentication && p.length > 0);

	return {
		ticketType: parts[0],
		operator: parts[1],
		validFrom: parts[2],
		validUntil: parts[3],
		pnr: parts[4],
		codes,
		authentication,
		soldAt
	};
}
