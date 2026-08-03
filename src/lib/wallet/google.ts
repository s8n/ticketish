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
import {
	APP_NAME,
	localParts,
	asUtcInstant,
	passIssuerName,
	tripTitle,
	utcOffsetLabel,
	UNOFFICIAL_LABEL,
	UNOFFICIAL_NOTE,
	type TripSummary
} from './trip.ts';
import { latin1Message, serialForPayload } from './pkpass.ts';
import { passColors } from './colors.ts';

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
		'This ticket is binary and Google documents no encoding for that. The bytes go in one per character, which works today but is not promised.',
		'Scan the finished pass back in here before you travel on it.'
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

/** One class covers every generic pass: they are all the same shape. */
const GENERIC_CLASS = 'ticketish_generic';

/**
 * Google shows at most ten text modules from an object, so a ticket with more
 * detail than that loses the tail rather than the fields anyone would miss.
 */
const MAX_TEXT_MODULES = 10;

/**
 * One transit class, whatever the operator.
 *
 * The card takes its top line from the class's issuer name and an object
 * cannot override it, so that field carries both names: the leg's
 * transitOperatorName does not come through on the card, and without this the
 * operator goes unnamed. Writing a per-ticket name into a shared class is a
 * known compromise. A class id is a key, so whichever operator wins the race
 * to create the class decides the name every pass shows, or, if a save link
 * does update an existing class, the last one saved renames the passes
 * already in the wallet.
 *
 * The alternative, a class per operator, is the one that fits the API and it
 * is not free: each class is a resource of its own to be reviewed and
 * approved, and an app that scans whatever ticket it is handed would grow
 * them without limit. The wallet apps that do this in the wild share one
 * class, so this does too.
 *
 * The version is part of the id because a save link creates a class the
 * issuer does not have and is not a way to edit one it does: changing what a
 * class says means pointing at one that does not exist yet. Old ones stay
 * behind in the issuer account, unused.
 */
const TRANSIT_CLASS_VERSION = 3;

const transitClassId = (issuerId: string) =>
	`${issuerId}.ticketish_rail_v${TRANSIT_CLASS_VERSION}`;

/**
 * A transit class needs a logo, and a logo is a URI Google's servers fetch,
 * so a pass can only be a transit pass when this app is being served from
 * somewhere Google can reach. Off a laptop or a private network it falls back
 * to the generic pass, which needs no images.
 */
export function transitLogoUri(origin: string | undefined): string | null {
	if (!origin || !origin.startsWith('https://')) return null;
	return `${origin}/icons/icon-192.png`;
}

/**
 * Which shape of pass this trip should be.
 *
 * A journey is a transit pass: Google lays out an origin, a destination, the
 * departure and the seat itself, rather than leaving them as rows of text.
 * Anything without a route, and anything this app cannot give a logo, is a
 * generic pass.
 *
 * A transit object also has to say when: the departure time is required
 * unless the object carries a validity interval, so a journey that says
 * neither cannot be one and falls back rather than being rejected on save.
 */
export function googlePassKind(
	trip: TripSummary,
	origin: string | undefined
): 'transit' | 'generic' {
	const when = trip.departure ?? trip.validFrom ?? trip.validUntil ?? trip.arrival;
	return trip.shape === 'journey' && trip.from && trip.to && when && transitLogoUri(origin)
		? 'transit'
		: 'generic';
}

/** The rows that go under the pass, whatever shape it is. */
function textModules(trip: TripSummary, exclude: Set<string>): TextModule[] {
	const rows: TextModule[] = [];
	const add = (header: string, body: string | undefined, id: string) => {
		if (body && !exclude.has(id)) rows.push({ header, body, id });
	};
	const departure = localParts(trip.departure);

	// the product names the pass when there is no route to name it, so it only
	// needs a row of its own when the title is saying something else
	add('Ticket', trip.product === tripTitle(trip) ? undefined : trip.product, 'product');
	add('Train', trip.train, 'train');
	add(
		'Departs',
		departure ? `${departure.date} ${departure.time ?? ''}`.trim() : undefined,
		'departs'
	);
	add('Class', trip.travelClass, 'class');
	add('Coach', trip.coach, 'coach');
	add('Seat', trip.seat, 'seat');
	add('Passenger', trip.passenger, 'passenger');
	add('Valid from', trip.validFrom?.replace('T', ' '), 'validFrom');
	add('Valid until', trip.validUntil?.replace('T', ' '), 'validUntil');
	add('Ticket number', trip.ticketId, 'ticketId');
	add('Booking reference', trip.reference, 'reference');
	add('Price', trip.price, 'price');
	for (const [i, detail] of trip.details.entries()) add(detail.label, detail.value, `detail${i}`);

	// the note keeps a slot of its own rather than taking its chances with the
	// cap, since it is the one row that has to be there
	return [
		...rows.slice(0, MAX_TEXT_MODULES - 1),
		{ header: UNOFFICIAL_LABEL, body: UNOFFICIAL_NOTE, id: 'unofficial' }
	];
}

/** The barcode object, which is the same either way. */
function barcodeOf(trip: TripSummary, payload: Uint8Array, symbology: BarcodeSymbology) {
	return {
		type: BARCODE_TYPES[symbology.format],
		// one character per byte: ASCII passes through as itself, and a
		// binary payload rides on Google reading the rest back as Latin-1
		value: latin1Message(payload),
		...(trip.ticketId ? { alternateText: trip.ticketId } : {})
	};
}

function validTimeInterval(trip: TripSummary): Record<string, unknown> | undefined {
	const start = asUtcInstant(trip.validFrom ?? trip.departure, trip.utcOffset);
	const end = asUtcInstant(trip.validUntil ?? trip.arrival, trip.utcOffset);
	if (!start && !end) return undefined;
	return {
		...(start ? { start: { date: start } } : {}),
		...(end ? { end: { date: end } } : {})
	};
}

/**
 * A date-time in the extended ISO 8601 form Google takes, which is documented
 * as accepting one with or without an offset. It gets the offset where the
 * ticket carried one and a bare wall clock where it did not, since an offset
 * we invented would move the time Google displays.
 */
function isoLocal(value: string | undefined, offsetMinutes?: number): string | undefined {
	const parts = localParts(value);
	if (!parts) return undefined;
	const local = `${parts.date}T${parts.time ?? '00:00'}:00`;
	return offsetMinutes === undefined ? local : local + utcOffsetLabel(offsetMinutes);
}

/** The generic object Google renders, built from the trip. */
export function buildGenericObject(
	trip: TripSummary,
	payload: Uint8Array,
	symbology: BarcodeSymbology,
	issuerId: string
): Record<string, unknown> {
	const object: Record<string, unknown> = {
		id: `${issuerId}.${serialForPayload(payload)}`,
		classId: `${issuerId}.${GENERIC_CLASS}`,
		state: 'ACTIVE',
		cardTitle: text(APP_NAME),
		header: text(tripTitle(trip)),
		subheader: text(trip.issuer),
		hexBackgroundColor: passColors(trip.operator).hex,
		barcode: barcodeOf(trip, payload, symbology),
		textModulesData: textModules(trip, new Set())
	};
	const interval = validTimeInterval(trip);
	if (interval) object.validTimeInterval = interval;
	return object;
}

/**
 * The transit object, which is the one worth having for a journey.
 *
 * Everything in the leg is a field Google lays out itself: the two stations
 * either side of an arrow, the departure and arrival, the coach and the seat.
 * Those fields are then left out of the text rows below, so the pass does not
 * say the same thing twice.
 *
 * `carriage` is the vehicle rather than the coach, which is where the train
 * number goes; the coach number belongs to the seat.
 */
export function buildTransitObject(
	trip: TripSummary,
	payload: Uint8Array,
	symbology: BarcodeSymbology,
	issuerId: string
): Record<string, unknown> {
	const seat: Record<string, unknown> = {};
	if (trip.coach) seat.coach = trip.coach;
	if (trip.seat) seat.seat = trip.seat;
	if (trip.travelClass) seat.customFareClass = text(trip.travelClass);

	const leg: Record<string, unknown> = {
		originName: text(trip.from!),
		destinationName: text(trip.to!),
		transitOperatorName: text(trip.issuer)
	};
	const departure = isoLocal(trip.departure, trip.utcOffset);
	const arrival = isoLocal(trip.arrival, trip.utcOffset);
	if (departure) leg.departureDateTime = departure;
	if (arrival) leg.arrivalDateTime = arrival;
	if (trip.train) leg.carriage = trip.train;
	if (trip.product) leg.fareName = text(trip.product);
	if (Object.keys(seat).length) leg.ticketSeat = seat;

	// what the leg already shows does not need a row of its own as well
	const covered = new Set(['train', 'departs', 'class', 'coach', 'seat']);
	const object: Record<string, unknown> = {
		id: `${issuerId}.${serialForPayload(payload)}`,
		classId: transitClassId(issuerId),
		state: 'ACTIVE',
		tripType: 'ONE_WAY',
		hexBackgroundColor: passColors(trip.operator).hex,
		barcode: barcodeOf(trip, payload, symbology),
		ticketLeg: leg,
		textModulesData: textModules(trip, covered)
	};
	if (trip.ticketId) object.ticketNumber = trip.ticketId;
	if (trip.passenger) {
		// the API rejects names without this, whatever the reference implies by
		// calling it context. One name is what the mapping carries, so it is
		// one passenger as far as anything here can say.
		object.passengerNames = trip.passenger;
		object.passengerType = 'SINGLE_PASSENGER';
	}
	if (trip.via) object.ticketRestrictions = { routeRestrictions: text(trip.via) };
	const interval = validTimeInterval(trip);
	if (interval) object.validTimeInterval = interval;
	return object;
}

/**
 * The class and object for this trip, as the JWT carries them.
 *
 * Both are declared inline, so an issuer that has never used this app gets
 * the class created on the first save rather than needing a setup step
 * somewhere else. A class has to be past `draft` before an object can exist
 * against it, and `UNDER_REVIEW` is what the documentation says to send: the
 * platform approves it and the object can be created straight away.
 */
export function buildPassPayload(
	trip: TripSummary,
	payload: Uint8Array,
	symbology: BarcodeSymbology,
	issuerId: string,
	origin: string | undefined
): Record<string, unknown> {
	const logo = transitLogoUri(origin);
	if (googlePassKind(trip, origin) === 'transit') {
		return {
			transitClasses: [
				{
					id: transitClassId(issuerId),
					issuerName: passIssuerName(trip),
					reviewStatus: 'UNDER_REVIEW',
					transitType: 'RAIL',
					logo: { sourceUri: { uri: logo } }
				}
			],
			transitObjects: [buildTransitObject(trip, payload, symbology, issuerId)]
		};
	}
	return {
		genericClasses: [{ id: `${issuerId}.${GENERIC_CLASS}` }],
		genericObjects: [buildGenericObject(trip, payload, symbology, issuerId)]
	};
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

/** Sign a save link for this ticket. */
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
		payload: buildPassPayload(trip, payload, symbology, issuer.issuerId, origin)
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
			`The link is ${jwt.length} characters, past the ${SAFE_JWT_LENGTH} Google calls safe, so it may be cut short.`
		);
	}
	return { jwt, warnings, url: `https://pay.google.com/gp/v/save/${jwt}` };
}
