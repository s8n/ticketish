// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Renfe ticket barcodes.
 *
 * Not a UIC format: the Aztec payload is fixed-width printable ASCII, padded
 * with "~", ending in a base64 DER signature. It carries two blocks, the
 * second of which is also printed separately as a QR code.
 *
 * The field layout below was derived by mapping a real ticket against its
 * printed contents, so treat unlabelled regions as unknown rather than
 * assuming they are empty.
 */
import { isPrintableAscii } from '../bytes.ts';

export interface RenfeTicket {
	/** "aztec" carries both blocks; "qr" is the short second block only. */
	variant: 'aztec' | 'qr';
	ticketNumber: string;
	companyCode?: string;
	trainNumber: string;
	/** ISO date of departure */
	departureDate: string;
	/** HH:MM local departure time, only present in the long form */
	departureTime?: string;
	originCode?: string;
	destinationCode?: string;
	coach: string;
	seat: string;
	/** Renfe "localizador" booking reference */
	bookingReference: string;
	/** Short code printed under the localizador */
	verificationCode: string;
	signature?: string;
}

const DIGITS = /^\d+$/;

const stripZeros = (s: string) => s.replace(/^0+/, '') || '0';

/** ddmmyy or dd/mm/yyyy to ISO. */
function toIsoDate(value: string): string | null {
	const slashed = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`;
	const compact = value.match(/^(\d{2})(\d{2})(\d{2})$/);
	if (compact) return `20${compact[3]}-${compact[2]}-${compact[1]}`;
	return null;
}

/** The short block, also issued on its own as a QR code. */
function parseBlockB(b: string): Omit<RenfeTicket, 'variant'> | null {
	if (b.length < 56) return null;
	const ticketNumber = b.slice(0, 13);
	const date = toIsoDate(b.slice(23, 29));
	if (!DIGITS.test(ticketNumber) || !date) return null;
	return {
		ticketNumber,
		trainNumber: stripZeros(b.slice(29, 34)),
		departureDate: date,
		coach: stripZeros(b.slice(34, 37)),
		seat: b.slice(37, 40).trim(),
		bookingReference: b.slice(43, 49).trim(),
		verificationCode: b.slice(51, 56).trim()
	};
}

export function isRenfe(data: Uint8Array): boolean {
	if (!isPrintableAscii(data)) return false;
	const s = new TextDecoder().decode(data);
	if (s.length === 56) return parseBlockB(s) !== null;
	if (s.length < 156) return false;
	// long form: 13-digit ticket number, then a dd/mm/yyyy date at a fixed offset
	return DIGITS.test(s.slice(0, 13)) && /^\d{2}\/\d{2}\/\d{4}$/.test(s.slice(23, 33));
}

export function parseRenfe(data: Uint8Array): RenfeTicket {
	const s = new TextDecoder().decode(data);

	if (s.length === 56) {
		const block = parseBlockB(s);
		if (!block) throw new Error('not a Renfe barcode');
		return { variant: 'qr', ...block };
	}

	const core = s.replace(/~+$/, '');
	const date = toIsoDate(s.slice(23, 33));
	if (!date) throw new Error('not a Renfe barcode');
	const block = parseBlockB(s.slice(100, 156));

	const signature = trailingSignature(core);

	return {
		variant: 'aztec',
		ticketNumber: s.slice(0, 13),
		companyCode: stripZeros(s.slice(13, 18)),
		trainNumber: stripZeros(s.slice(18, 23)),
		departureDate: date,
		departureTime: s.slice(33, 38),
		originCode: stripZeros(s.slice(38, 45)),
		destinationCode: stripZeros(s.slice(45, 52)),
		coach: stripZeros(s.slice(52, 55)),
		seat: s.slice(55, 58).trim(),
		bookingReference: block?.bookingReference ?? '',
		verificationCode: block?.verificationCode ?? '',
		signature
	};
}

/**
 * The base64 signature sits at the end, separated from the payload by a long
 * run of "0" padding. Scan back for that run rather than pattern matching,
 * since base64 and the padding share an alphabet.
 */
function trailingSignature(core: string): string | undefined {
	let zeros = 0;
	for (let i = core.length - 1; i >= 0; i--) {
		if (core[i] === '0') {
			zeros++;
			if (zeros >= 16) {
				const signature = core.slice(i + zeros);
				return signature.length >= 16 ? signature : undefined;
			}
		} else {
			zeros = 0;
		}
	}
	return undefined;
}
