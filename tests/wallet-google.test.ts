// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Google Wallet, which is mostly a test of what it refuses.
 *
 * A Google pass carries its barcode as a JSON string with no binary or
 * Latin-1 encoding available, so a UIC or VDV payload cannot go into one and
 * come back out unchanged. The important assertion in this file is that such
 * a ticket is turned away with a reason rather than turned into a pass whose
 * barcode does not scan.
 */
import { describe, expect, it } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
	buildGenericObject,
	buildSaveLink,
	GOOGLE_EXPORT_ENABLED,
	googleProblem,
	loadGoogleIssuer,
	MAX_JWT_LENGTH
} from '../src/lib/wallet/google.ts';
import type { TripSummary } from '../src/lib/wallet/trip.ts';
import type { BarcodeSymbology } from '../src/lib/tickets/types.ts';

const AZTEC: BarcodeSymbology = { format: 'Aztec' };
const QR: BarcodeSymbology = { format: 'QRCode' };

const ascii = (text: string) => new TextEncoder().encode(text);

const trip: TripSummary = {
	shape: 'journey',
	issuer: 'Test Railways',
	product: 'Advance single',
	from: 'Alpha',
	to: 'Beta',
	train: '1234',
	departure: '2026-09-01T08:15',
	ticketId: 'TKT1',
	details: [{ label: 'Fare', value: 'Advance' }]
};

function serviceAccount() {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	return {
		json: JSON.stringify({
			type: 'service_account',
			client_email: 'passes@example.iam.gserviceaccount.com',
			private_key: privateKey.export({ format: 'pem', type: 'pkcs8' })
		}),
		publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }) as string
	};
}

describe('whether the button is offered at all', () => {
	it('stays off while every mapped format is one Google would refuse', () => {
		// UIC and VDV are the only formats with a mapping and both are binary,
		// so the button would exist only to say it cannot be pressed. Turning
		// this on belongs with the first text-payload mapping, not before it.
		expect(GOOGLE_EXPORT_ENABLED).toBe(false);
	});
});

describe('what Google Wallet cannot carry', () => {
	it('refuses a binary payload, which is every UIC and VDV ticket', () => {
		// a zlib stream starts 0x78 0x9c: not text, and there is no encoding
		// in the Google barcode object that would carry it
		const payload = new Uint8Array([0x23, 0x55, 0x54, 0x78, 0x9c, 0xff, 0x00]);
		expect(googleProblem(payload, AZTEC)).toMatch(/binary/);
	});

	it('refuses a symbology it cannot draw', () => {
		expect(googleProblem(ascii('HELLO'), { format: 'DataMatrix' })).toMatch(/cannot show/);
	});

	it('accepts a payload that is text all the way through', () => {
		expect(googleProblem(ascii('#UT01ABCDEF'), AZTEC)).toBeNull();
		expect(googleProblem(ascii('SOMETICKET123'), QR)).toBeNull();
	});

	it('will not build a link for a payload it refused', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '3388000000022000000');
		await expect(
			buildSaveLink(trip, new Uint8Array([0x00, 0xff]), AZTEC, issuer)
		).rejects.toThrow(/binary/);
	});
});

describe('the issuer credentials', () => {
	it('reads a service account key file', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, ' 3388000000022000000 ');
		expect(issuer.issuerId).toBe('3388000000022000000');
		expect(issuer.serviceAccountEmail).toBe('passes@example.iam.gserviceaccount.com');
	});

	it('says what is wrong with a file that is not one', async () => {
		await expect(loadGoogleIssuer('not json', '1')).rejects.toThrow(/service account/);
		await expect(loadGoogleIssuer('{}', '1')).rejects.toThrow(/private_key/);
	});

	it('insists the issuer ID is the number from the console', async () => {
		const { json } = serviceAccount();
		await expect(loadGoogleIssuer(json, 'my-issuer')).rejects.toThrow(/number/);
	});
});

describe('the pass itself', () => {
	it('puts the ticket text into the barcode unchanged', () => {
		const payload = ascii('TICKETTEXT-0001');
		const object = buildGenericObject(trip, payload, AZTEC, '333') as {
			barcode: { type: string; value: string };
			id: string;
			classId: string;
		};
		expect(object.barcode.type).toBe('AZTEC');
		expect(object.barcode.value).toBe('TICKETTEXT-0001');
		expect(object.id.startsWith('333.')).toBe(true);
		expect(object.classId).toBe('333.ticketish_generic');
	});

	it('carries the mapped fields as text rows', () => {
		const object = buildGenericObject(trip, ascii('X'), AZTEC, '333') as {
			textModulesData: { header: string; body: string }[];
		};
		const rows = Object.fromEntries(object.textModulesData.map((r) => [r.header, r.body]));
		expect(rows.Train).toBe('1234');
		expect(rows.Departs).toBe('2026-09-01 08:15');
		expect(rows.Fare).toBe('Advance');
	});

	it('signs a save link the service account key verifies', async () => {
		const { json, publicKeyPem } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '333');
		const { jwt, url } = await buildSaveLink(trip, ascii('TICKETTEXT-0001'), AZTEC, issuer);

		expect(url).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
		const [header, claims, signature] = jwt.split('.');
		expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
			alg: 'RS256',
			typ: 'JWT'
		});
		const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
		expect(payload.typ).toBe('savetowallet');
		expect(payload.iss).toBe('passes@example.iam.gserviceaccount.com');
		// the class is declared alongside the object, so a fresh issuer works
		expect(payload.payload.genericClasses[0].id).toBe('333.ticketish_generic');

		const verifier = createVerify('sha256');
		verifier.update(`${header}.${claims}`);
		expect(verifier.verify(publicKeyPem, Buffer.from(signature, 'base64url'))).toBe(true);
	});

	it('refuses a pass too long for the save link to survive a browser', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '333');
		const long = { ...trip, details: [{ label: 'Note', value: 'x'.repeat(MAX_JWT_LENGTH) }] };
		await expect(buildSaveLink(long, ascii('TICKET'), AZTEC, issuer)).rejects.toThrow(
			/save link holds/
		);
	});
});
