// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Google Wallet export, and the two places it is running on faith.
 *
 * Google takes a pass as a JWT signed with the issuer's service account key,
 * which the browser can do: RS256 is the same RSA signature the pass
 * certificate uses. The whole object is written into the token and Wallet
 * creates it on save, so nothing here calls the Wallet REST API and nothing
 * needs an OAuth token.
 *
 * **The barcode.** `Barcode.value` is a JSON string, and the only render
 * encoding Google documents is UTF_8, for QR codes alone. There is no Latin-1
 * mode and no binary field, so on paper a UIC or VDV payload cannot go in: it
 * is a compressed stream and a signature, not text. In practice other issuers
 * write the bytes into that string one character per byte and Google appears
 * to read them back the same way, producing a symbol that decodes to the
 * original payload. That is the same convention Apple names outright with
 * `messageEncoding`, which is why `latin1Message` is shared between the two.
 *
 * It is undocumented and Google could stop doing it without telling anyone,
 * so a binary pass is offered with that said plainly rather than either
 * refused or presented as reliable. `googleCaveats` is what says it, and the
 * way to settle it for a given ticket is to scan the pass back into this app.
 *
 * **The length.** A save link is a URL carrying the whole token, and Google
 * documents 1800 characters as the safe length. A DB ticket signs to roughly
 * three thousand, because a few hundred bytes of binary become a JSON string,
 * then UTF-8, then base64. Every binary pass is therefore over the documented
 * limit and under what browsers actually carry. It is offered, with that said
 * too. The way out, if it turns out not to work, is creating the object
 * through the REST API and putting only its id in the link, which needs an
 * OAuth token exchange and so a network round trip: a different design, not a
 * tweak to this one.
 *
 * The third thing to keep expectations low: an issuer account starts
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
import { latin1Message, serialForPayload } from './pkpass.ts';

/** Whether the UI offers this at all. */
export const GOOGLE_EXPORT_ENABLED = true;

/** zxing format name to the Google barcode type that renders the same symbol. */
const BARCODE_TYPES: Record<string, string> = {
	Aztec: 'AZTEC',
	QRCode: 'QR_CODE',
	PDF417: 'PDF_417'
};

/**
 * Why this ticket cannot become a Google pass at all, or null when it can.
 * Only the symbology is a hard stop: a symbol Google will not draw is a pass
 * with no barcode on it.
 */
export function googleProblem(
	_payload: Uint8Array,
	symbology: BarcodeSymbology | undefined
): string | null {
	if (!symbology) return 'the payload did not come from a barcode this app can identify';
	if (!BARCODE_TYPES[symbology.format]) {
		return `Google Wallet cannot show a ${symbology.format} barcode`;
	}
	return null;
}

/**
 * What might go wrong anyway, as sentences to put in front of the reader
 * before they press the button. Empty when the ticket is one Google's own
 * documentation covers.
 */
export function googleCaveats(payload: Uint8Array): string[] {
	if (isPrintableAscii(payload)) return [];
	return [
		'this ticket is binary, and Google documents no encoding for that. The bytes go in one character per byte, which is what other issuers do and what Apple names outright, but Google is under no obligation to keep reading them that way.',
		'scan the finished pass back into this app before you travel on it. If the payload comes back identical, it worked.'
	];
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
			// one character per byte: ASCII passes through as itself, and a
			// binary payload rides on Google reading the rest back as Latin-1
			value: latin1Message(payload),
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
 * The length Google documents as safe for a save link, past which it warns
 * that browsers may truncate the URL. Every binary ticket is over it, so this
 * is a threshold for saying so rather than for refusing.
 */
export const SAFE_JWT_LENGTH = 1800;

/**
 * Where offering it stops being daring and starts being pointless. Browsers
 * carry far longer URLs than this, but nothing about a token this size would
 * be a rail ticket, and a link nobody's infrastructure will pass on is not
 * worth building.
 */
export const MAX_JWT_LENGTH = 8000;

export interface GoogleSaveLink {
	url: string;
	jwt: string;
	/** Things that could still go wrong, to show beside the link. */
	warnings: string[];
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
			`the signed pass is ${jwt.length} characters, past anything a link will carry, so this ticket cannot be saved this way`
		);
	}

	const warnings = googleCaveats(payload);
	if (jwt.length > SAFE_JWT_LENGTH) {
		warnings.push(
			`the link is ${jwt.length} characters and Google documents ${SAFE_JWT_LENGTH} as the safe length, so it may be turned away or cut short on the way.`
		);
	}
	return { jwt, warnings, url: `https://pay.google.com/gp/v/save/${jwt}` };
}
