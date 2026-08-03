// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Google Wallet, where the interesting part is what is promised rather than
 * what is produced.
 *
 * A binary payload goes into the barcode string one character per byte, which
 * is undocumented on Google's side: it works because other issuers do it and
 * Google reads it back the same way. So the tests check that the bytes are
 * written the way that convention requires, and that the pass comes with the
 * caveats saying it might stop being true.
 */
import { describe, expect, it } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
	buildGenericObject,
	buildSaveLink,
	googleCaveats,
	googleProblem,
	loadGoogleIssuer,
	MAX_JWT_LENGTH,
	SAFE_JWT_LENGTH
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

describe('what Google Wallet will and will not take', () => {
	it('refuses a symbology it cannot draw, which is the only hard stop', () => {
		expect(googleProblem(ascii('HELLO'), { format: 'DataMatrix' })).toMatch(/cannot show/);
		expect(googleProblem(ascii('HELLO'), undefined)).toMatch(/did not come from a barcode/);
	});

	it('accepts a binary payload, with what could go wrong attached', () => {
		// a zlib stream starts 0x78 0x9c: not text, and nothing in Google's
		// documentation says what happens to it
		const payload = new Uint8Array([0x23, 0x55, 0x54, 0x78, 0x9c, 0xff, 0x00]);
		expect(googleProblem(payload, AZTEC)).toBeNull();
		const caveats = googleCaveats(payload);
		expect(caveats.length).toBeGreaterThan(0);
		expect(caveats[0]).toMatch(/undocumented|documents no encoding/);
		expect(caveats.join(' ')).toMatch(/scan the finished pass back/i);
	});

	it('says nothing about a payload that is text all the way through', () => {
		expect(googleProblem(ascii('#UT01ABCDEF'), AZTEC)).toBeNull();
		expect(googleProblem(ascii('SOMETICKET123'), QR)).toBeNull();
		expect(googleCaveats(ascii('SOMETICKET123'))).toEqual([]);
	});

	it('will not build a link for a symbology it refused', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '3388000000022000000');
		await expect(
			buildSaveLink(trip, ascii('TICKET'), { format: 'DataMatrix' }, issuer)
		).rejects.toThrow(/cannot show/);
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

	it('writes a binary payload one character per byte', () => {
		// every byte value, including the ones a text encoding would mangle
		const payload = Uint8Array.from({ length: 256 }, (_, i) => i);
		const object = buildGenericObject(trip, payload, AZTEC, '333') as {
			barcode: { value: string };
		};
		const value = object.barcode.value;
		expect(value.length).toBe(256);
		// what Google has to do to give the symbol back its bytes
		expect([...value].map((c) => c.charCodeAt(0))).toEqual([...payload]);
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

	it('warns past the documented safe length instead of refusing', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '333');
		const wordy = { ...trip, details: [{ label: 'Note', value: 'x'.repeat(SAFE_JWT_LENGTH) }] };
		const link = await buildSaveLink(wordy, ascii('TICKET'), AZTEC, issuer);
		expect(link.jwt.length).toBeGreaterThan(SAFE_JWT_LENGTH);
		expect(link.warnings.join(' ')).toMatch(/safe length/);
		expect(link.url).toContain(link.jwt);
	});

	it('refuses only what no link would carry at all', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '333');
		const huge = { ...trip, details: [{ label: 'Note', value: 'x'.repeat(MAX_JWT_LENGTH) }] };
		await expect(buildSaveLink(huge, ascii('TICKET'), AZTEC, issuer)).rejects.toThrow(
			/past anything a link will carry/
		);
	});

	it('signs a real-sized binary ticket, over the safe length and under the cap', async () => {
		const { json } = serviceAccount();
		const issuer = await loadGoogleIssuer(json, '333');
		// a UIC payload is a few hundred bytes of compressed data and signature
		const payload = Uint8Array.from({ length: 414 }, (_, i) => (i * 37 + 11) % 256);
		const link = await buildSaveLink(trip, payload, AZTEC, issuer);
		expect(link.jwt.length).toBeGreaterThan(SAFE_JWT_LENGTH);
		expect(link.jwt.length).toBeLessThan(MAX_JWT_LENGTH);
		// both caveats: the encoding, and the length
		expect(link.warnings.length).toBe(3);
	});
});
