// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Google Wallet export, and the honest limits of it.
 *
 * Google takes a pass as a JWT signed with the issuer's service account key,
 * which the browser can do: RS256 is the same RSA signature the pass
 * certificate uses. The whole object is written into the token and Wallet
 * creates it on save, so nothing here calls the Wallet REST API and nothing
 * needs an OAuth token.
 *
 * The limit is the barcode, and it is not one we can engineer around.
 * `Barcode.value` is a JSON string, and the only render encoding Google
 * defines is UTF_8, documented as supported for QR codes alone. There is no
 * Latin-1 mode and no binary field, so a payload holding bytes that are not
 * printable ASCII cannot be put into a Google pass and read back out
 * unchanged. That rules out UIC 918.3 and VDV-KA, whose payloads are a
 * compressed stream and a signature: the pass would show a barcode that does
 * not scan.
 *
 * So this refuses those rather than producing them, and says why. The formats
 * whose payload is text - RSP6, the SNCF e-billet, ELB - go through fine. The
 * test for that is the same `isPrintableAscii` the parsers use to tell the
 * plaintext formats from the bit-packed ones.
 *
 * The other reason to keep expectations low: an issuer account starts
 * unpublished, so passes it creates are only saved by accounts registered as
 * testers on it. That is a Google-side setting this app cannot see.
 *
 * Saving is a navigation to pay.google.com carrying the token. It is the one
 * thing in this app that leaves the device, it happens only when the reader
 * clicks the button, and the ticket is inside the token when it does.
 */
import { isPrintableAscii } from '../tickets/bytes.ts';
import type { BarcodeSymbology } from '../tickets/types.ts';
import { importPrivateKey } from './identity.ts';
import { localParts, asUtcInstant, tripTitle, type TripSummary } from './trip.ts';
import { serialForPayload } from './pkpass.ts';

/** zxing format name to the Google barcode type that renders the same symbol. */
const BARCODE_TYPES: Record<string, string> = {
	Aztec: 'AZTEC',
	QRCode: 'QR_CODE',
	PDF417: 'PDF_417'
};

/**
 * Why this ticket cannot become a Google pass, or null when it can. The
 * encoding case is the one worth reading: see the note at the top of the file.
 */
export function googleProblem(
	payload: Uint8Array,
	symbology: BarcodeSymbology | undefined
): string | null {
	if (!symbology) return 'the payload did not come from a barcode this app can identify';
	if (!BARCODE_TYPES[symbology.format]) {
		return `Google Wallet cannot show a ${symbology.format} barcode`;
	}
	if (!isPrintableAscii(payload)) {
		return 'Google Wallet carries a barcode as a text string, so it cannot hold this ticket: the payload is binary and would not survive the round trip';
	}
	return null;
}

/** The credentials a Google Wallet issuer signs with. */
export interface GoogleIssuer {
	/** Numeric issuer ID from the Google Wallet Business Console. */
	issuerId: string;
	/** Service account address, which is the JWT's issuer claim. */
	serviceAccountEmail: string;
	key: CryptoKey;
}

/** Read an issuer out of a service account JSON key plus the issuer ID. */
export async function loadGoogleIssuer(
	serviceAccountJson: string,
	issuerId: string
): Promise<GoogleIssuer> {
	let parsed: { client_email?: string; private_key?: string; type?: string };
	try {
		parsed = JSON.parse(serviceAccountJson);
	} catch {
		throw new Error('this is not a service account JSON key file');
	}
	if (!parsed.private_key || !parsed.client_email) {
		throw new Error('the key file has no private_key and client_email pair');
	}
	if (!/^\d+$/.test(issuerId.trim())) {
		throw new Error('the issuer ID is the number from the Wallet console');
	}
	const { key } = await importPrivateKey(parsed.private_key);
	return { issuerId: issuerId.trim(), serviceAccountEmail: parsed.client_email, key };
}

const encoder = new TextEncoder();

/** base64url without padding, which is what a JWT is made of. */
function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const jsonPart = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

interface TextModule {
	header: string;
	body: string;
	id: string;
}

/** Google labels every visible string with a language, even a station name. */
const text = (value: string) => ({ defaultValue: { language: 'en', value } });

/** One class per issuer is enough: every pass this app writes is the same shape. */
const CLASS_SUFFIX = 'ticketish_generic';

/** The generic object Google renders, built from the trip. */
export function buildGenericObject(
	trip: TripSummary,
	payload: Uint8Array,
	symbology: BarcodeSymbology,
	issuerId: string
): Record<string, unknown> {
	const suffix = serialForPayload(payload);
	const rows: TextModule[] = [];
	const add = (header: string, body: string | undefined, id: string) => {
		if (body) rows.push({ header, body, id });
	};

	const departure = localParts(trip.departure);
	add('Train', trip.train, 'train');
	add('Departs', departure ? `${departure.date} ${departure.time ?? ''}`.trim() : undefined, 'departs');
	add('Class', trip.travelClass, 'class');
	add('Coach', trip.coach, 'coach');
	add('Seat', trip.seat, 'seat');
	add('Passenger', trip.passenger, 'passenger');
	add('Valid from', trip.validFrom?.replace('T', ' '), 'validFrom');
	add('Valid until', trip.validUntil?.replace('T', ' '), 'validUntil');
	add('Ticket number', trip.ticketId, 'ticketId');
	add('Booking reference', trip.reference, 'reference');
	for (const [i, detail] of trip.details.entries()) add(detail.label, detail.value, `detail${i}`);

	const object: Record<string, unknown> = {
		id: `${issuerId}.${suffix}`,
		classId: `${issuerId}.${CLASS_SUFFIX}`,
		state: 'ACTIVE',
		cardTitle: text(trip.issuer),
		header: text(tripTitle(trip)),
		hexBackgroundColor: '#26324b',
		barcode: {
			type: BARCODE_TYPES[symbology.format],
			value: new TextDecoder('ascii').decode(payload),
			...(trip.ticketId ? { alternateText: trip.ticketId } : {})
		},
		textModulesData: rows
	};
	if (trip.product) object.subheader = text(trip.product);

	const start = asUtcInstant(trip.validFrom ?? trip.departure);
	const end = asUtcInstant(trip.validUntil ?? trip.arrival);
	if (start || end) {
		object.validTimeInterval = {
			...(start ? { start: { date: start } } : {}),
			...(end ? { end: { date: end } } : {})
		};
	}
	return object;
}

/**
 * Google truncates a save link the browser will not carry. The documented
 * safe length is 1800 characters for the whole encoded token.
 */
export const MAX_JWT_LENGTH = 1800;

export interface GoogleSaveLink {
	url: string;
	jwt: string;
}

/**
 * Sign a save link for this ticket.
 *
 * The class is declared inline alongside the object, so an issuer that has
 * never used this app gets one created on the first save rather than needing
 * a setup step somewhere else.
 */
export async function buildSaveLink(
	trip: TripSummary,
	payload: Uint8Array,
	symbology: BarcodeSymbology,
	issuer: GoogleIssuer,
	origin?: string
): Promise<GoogleSaveLink> {
	const problem = googleProblem(payload, symbology);
	if (problem) throw new Error(problem);

	const claims = {
		iss: issuer.serviceAccountEmail,
		aud: 'google',
		typ: 'savetowallet',
		origins: origin ? [origin] : [],
		payload: {
			genericClasses: [{ id: `${issuer.issuerId}.${CLASS_SUFFIX}` }],
			genericObjects: [buildGenericObject(trip, payload, symbology, issuer.issuerId)]
		}
	};

	const signingInput = `${jsonPart({ alg: 'RS256', typ: 'JWT' })}.${jsonPart(claims)}`;
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			'RSASSA-PKCS1-v1_5',
			issuer.key,
			encoder.encode(signingInput) as unknown as BufferSource
		)
	);
	const jwt = `${signingInput}.${base64url(signature)}`;
	if (jwt.length > MAX_JWT_LENGTH) {
		throw new Error(
			`the signed pass is ${jwt.length} characters and Google's save link holds ${MAX_JWT_LENGTH}, so this ticket carries too much to save this way`
		);
	}
	return { jwt, url: `https://pay.google.com/gp/v/save/${jwt}` };
}
