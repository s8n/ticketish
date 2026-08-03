// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Write a signed .pkpass.
 *
 * A pass is a zip holding pass.json, its images, a manifest of SHA-1 digests
 * and a detached signature over that manifest. All of it is built here and
 * none of it leaves the device: the ticket, the certificate and the key meet
 * in this file and nowhere else.
 *
 * The barcode is the part that has to be right. Apple takes the payload as a
 * string plus a `messageEncoding`, and every binary rail format depends on
 * that pair: the message holds one character per byte and the encoding says to
 * read those characters back as Latin-1. It is exactly the convention
 * `input/pkpass.ts` already reads, which is how the app can scan a DB pass
 * from Wallet in the first place, so writing one is the same rule run
 * backwards. Anything else, including letting the string be interpreted as
 * UTF-8, changes the bytes and produces a pass whose barcode does not scan.
 *
 * The serial number is derived from the payload rather than made up, so
 * exporting the same ticket twice updates the pass already in Wallet instead
 * of adding a second copy of it.
 */
import { zipSync } from 'fflate';
import { sha1 } from '../tickets/vdv/sha1.ts';
import { hex } from '../tickets/bytes.ts';
import type { BarcodeSymbology } from '../tickets/types.ts';
import { signDetached } from './cms.ts';
import type { SigningIdentity } from './identity.ts';
import { asUtcInstant, localParts, tripTitle, type TripSummary } from './trip.ts';

/** zxing format name to the constant Apple uses for the same symbology. */
const BARCODE_FORMATS: Record<string, string> = {
	Aztec: 'PKBarcodeFormatAztec',
	QRCode: 'PKBarcodeFormatQR',
	PDF417: 'PKBarcodeFormatPDF417'
};

/**
 * Why this ticket cannot become a pass, or null when it can. DataMatrix is
 * the live case: the app reads it, Wallet has no constant for it, and a pass
 * carrying the payload in some other symbology would not scan at the barrier.
 */
export function barcodeProblem(symbology: BarcodeSymbology | undefined): string | null {
	if (!symbology) return 'the payload did not come from a barcode this app can identify';
	if (!BARCODE_FORMATS[symbology.format]) {
		return `Apple Wallet cannot show a ${symbology.format} barcode`;
	}
	return null;
}

/** One character per byte, which `messageEncoding` then reads back as bytes. */
export function latin1Message(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return out;
}

interface PassField {
	key: string;
	label?: string;
	value: string;
	dateStyle?: string;
	timeStyle?: string;
}

/** Add a field, skipping the ones the format did not fill in. */
function push(fields: PassField[], key: string, label: string, value: string | undefined): void {
	if (value !== undefined && value !== '') fields.push({ key, label, value });
}

const DASH = '–';

/** A date range for a period ticket, with an en dash for a missing end. */
function range(from: string | undefined, until: string | undefined): string | undefined {
	const start = localParts(from);
	const end = localParts(until);
	if (!start && !end) return undefined;
	return `${start ? start.date : DASH} to ${end ? end.date : DASH}`;
}

export interface PassColors {
	background: string;
	foreground: string;
	label: string;
}

/** The app's own palette, so an exported pass still looks like it came here. */
const COLORS: PassColors = {
	background: 'rgb(38, 50, 75)',
	foreground: 'rgb(247, 226, 198)',
	label: 'rgb(198, 174, 140)'
};

export interface PassJsonInput {
	trip: TripSummary;
	payload: Uint8Array;
	symbology: BarcodeSymbology;
	passTypeIdentifier: string;
	teamIdentifier: string;
	serialNumber: string;
}

/**
 * The pass.json for a trip.
 *
 * A journey becomes a boarding pass, which is the style Wallet lays out with
 * an origin, a destination and an arrow between them. A period ticket has
 * none of those, so it becomes a generic pass rather than a boarding pass
 * with two empty halves: the Deutschlandticket is an area and a date range,
 * and saying so is more useful than pretending it is a trip.
 */
export function buildPassJson(input: PassJsonInput): Record<string, unknown> {
	const { trip, payload, symbology } = input;
	const journey = trip.shape === 'journey';

	const header: PassField[] = [];
	const primary: PassField[] = [];
	const secondary: PassField[] = [];
	const auxiliary: PassField[] = [];
	const back: PassField[] = [];

	const departure = localParts(trip.departure);

	if (journey) {
		push(header, 'train', 'Train', trip.train);
		push(primary, 'from', 'From', trip.from ?? DASH);
		push(primary, 'to', 'To', trip.to ?? DASH);
		if (departure) {
			push(secondary, 'date', 'Date', departure.date);
			push(secondary, 'departs', 'Departs', departure.time ?? undefined);
			push(secondary, 'arrives', 'Arrives', localParts(trip.arrival)?.time ?? undefined);
		} else {
			// a flexible ticket has a route but no train to catch, so the date
			// range is what belongs where the departure would have been
			push(secondary, 'validity', 'Valid', range(trip.validFrom, trip.validUntil));
		}
		push(auxiliary, 'class', 'Class', trip.travelClass);
		push(auxiliary, 'coach', 'Coach', trip.coach);
		push(auxiliary, 'seat', 'Seat', trip.seat);
		push(auxiliary, 'passenger', 'Passenger', trip.passenger);
	} else {
		push(header, 'class', 'Class', trip.travelClass);
		push(primary, 'product', 'Ticket', trip.product ?? trip.issuer);
		push(secondary, 'validity', 'Valid', range(trip.validFrom, trip.validUntil));
		push(auxiliary, 'passenger', 'Passenger', trip.passenger);
	}

	push(back, 'product', 'Product', journey ? trip.product : undefined);
	push(back, 'route', 'Route', trip.via);
	push(back, 'validFrom', 'Valid from', trip.validFrom?.replace('T', ' '));
	push(back, 'validUntil', 'Valid until', trip.validUntil?.replace('T', ' '));
	push(back, 'ticketId', 'Ticket number', trip.ticketId);
	push(back, 'reference', 'Booking reference', trip.reference);
	push(back, 'price', 'Price', trip.price);
	for (const [i, detail] of trip.details.entries()) {
		push(back, `detail${i}`, detail.label, detail.value);
	}

	const style = journey
		? {
				transitType: 'PKTransitTypeTrain',
				headerFields: header,
				primaryFields: primary,
				secondaryFields: secondary,
				auxiliaryFields: auxiliary,
				backFields: back
			}
		: {
				headerFields: header,
				primaryFields: primary,
				secondaryFields: secondary,
				auxiliaryFields: auxiliary,
				backFields: back
			};

	const pass: Record<string, unknown> = {
		formatVersion: 1,
		passTypeIdentifier: input.passTypeIdentifier,
		teamIdentifier: input.teamIdentifier,
		serialNumber: input.serialNumber,
		organizationName: trip.issuer,
		description: tripTitle(trip),
		backgroundColor: COLORS.background,
		foregroundColor: COLORS.foreground,
		labelColor: COLORS.label,
		barcodes: [
			{
				format: BARCODE_FORMATS[symbology.format],
				message: latin1Message(payload),
				messageEncoding: 'iso-8859-1',
				...(trip.ticketId ? { altText: trip.ticketId } : {})
			}
		],
		[journey ? 'boardingPass' : 'generic']: style
	};

	// A relevant date is what puts the pass on the lock screen at the right
	// moment. Only set it where the ticket actually says when that is.
	const relevant = asUtcInstant(trip.departure ?? trip.validFrom);
	if (relevant) pass.relevantDate = relevant;
	const expires = asUtcInstant(trip.validUntil ?? trip.arrival);
	if (expires) pass.expirationDate = expires;

	const semantics: Record<string, unknown> = {};
	if (trip.issuer) semantics.transitProvider = trip.issuer;
	if (journey) {
		if (trip.from) semantics.departureStationName = trip.from;
		if (trip.to) semantics.destinationStationName = trip.to;
		if (trip.train) semantics.vehicleNumber = trip.train;
		const departureInstant = asUtcInstant(trip.departure);
		if (departureInstant) semantics.originalDepartureDate = departureInstant;
	}
	if (Object.keys(semantics).length > 1) pass.semantics = semantics;

	return pass;
}

/** The images a pass carries, keyed by the name they take inside the zip. */
export type PassAssets = Record<string, Uint8Array>;

export interface PkpassInput {
	trip: TripSummary;
	payload: Uint8Array;
	symbology: BarcodeSymbology;
	identity: SigningIdentity;
	assets: PassAssets;
	/** Defaults to a digest of the payload, so a re-export updates in place. */
	serialNumber?: string;
	signedAt?: Date;
}

/** A stable serial for a payload: the same ticket always gets the same one. */
export const serialForPayload = (payload: Uint8Array) => hex(sha1(payload)).slice(0, 24);

/**
 * Build and sign the pass. Returns the zip, ready to be handed to Wallet.
 *
 * The manifest is a map of file name to SHA-1, which is the digest Apple
 * specified in 2012 and still reads; the signature over it is SHA-256, which
 * is what the certificate's key is used with.
 */
export async function buildPkpass(input: PkpassInput): Promise<Uint8Array> {
	const problem = barcodeProblem(input.symbology);
	if (problem) throw new Error(problem);
	if (!input.assets['icon.png']) throw new Error('a pass needs at least an icon.png');

	const serialNumber = input.serialNumber ?? serialForPayload(input.payload);
	const passJson = buildPassJson({
		trip: input.trip,
		payload: input.payload,
		symbology: input.symbology,
		passTypeIdentifier: input.identity.passTypeIdentifier,
		teamIdentifier: input.identity.teamIdentifier,
		serialNumber
	});

	const files: Record<string, Uint8Array> = {
		...input.assets,
		'pass.json': new TextEncoder().encode(JSON.stringify(passJson, null, '\t'))
	};

	const manifest: Record<string, string> = {};
	for (const name of Object.keys(files).sort()) manifest[name] = hex(sha1(files[name]));
	const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, '\t'));

	const signature = await signDetached(manifestBytes, input.identity.signer, input.signedAt);

	return zipSync(
		{ ...files, 'manifest.json': manifestBytes, signature },
		{ mtime: input.signedAt ?? new Date() }
	);
}

/** The MIME type Safari needs to see before it hands a pass to Wallet. */
export const PKPASS_MIME = 'application/vnd.apple.pkpass';

/** A file name that says what the pass is without leaking the whole trip. */
export function pkpassFileName(trip: TripSummary): string {
	const base = tripTitle(trip)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `${base || 'ticket'}.pkpass`;
}
