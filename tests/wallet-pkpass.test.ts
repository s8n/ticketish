// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Signing a pass, end to end: a throwaway certificate goes in, a .pkpass
 * comes out, and the signature over its manifest verifies.
 *
 * The signature is checked twice over. Once by hand, because the detail that
 * breaks CMS quietly is which encoding of the signed attributes was signed,
 * and a check that re-derives it is the only one that would catch getting it
 * wrong. Once with openssl where the machine has it, because agreeing with
 * ourselves is not the same as agreeing with the thing Apple runs.
 *
 * The barcode gets its own check: the pass is read back with the app's own
 * pkpass reader, which is the code that scans a wallet pass in the first
 * place, and the payload has to come out identical to the bytes that went in.
 * That is the whole game for a binary rail ticket.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVerify, X509Certificate } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { children, oidString, readNode, TAG, tlv } from '../src/lib/wallet/der.ts';
import { identityProblem, loadIdentity } from '../src/lib/wallet/identity.ts';
import {
	barcodeProblem,
	buildPkpass,
	latin1Message,
	pkpassFileName,
	serialForPayload
} from '../src/lib/wallet/pkpass.ts';
import { readPkpass } from '../src/lib/input/pkpass.ts';
import { sha1 } from '../src/lib/tickets/vdv/sha1.ts';
import { hex } from '../src/lib/tickets/bytes.ts';
import type { TripSummary } from '../src/lib/wallet/trip.ts';
import type { BarcodeSymbology } from '../src/lib/tickets/types.ts';
import { otherKeyPem, testCertificate } from './helpers/x509.ts';

const AZTEC: BarcodeSymbology = { format: 'Aztec', size: { width: 47, height: 47 } };

/** A payload with the bytes that make a rail barcode awkward: all of them. */
const binaryPayload = () => Uint8Array.from({ length: 256 }, (_, i) => (i * 7 + 3) % 256);

const trip: TripSummary = {
	shape: 'journey',
	issuer: 'Test Railways',
	product: 'Sparpreis',
	travelClass: '2nd class',
	passenger: 'A Traveller',
	from: 'Alpha Hbf',
	to: 'Beta Hbf',
	train: 'ICE 1234',
	departure: '2026-09-01T08:15',
	arrival: '2026-09-01T11:42',
	coach: '7',
	seat: '41',
	ticketId: 'TESTTICKET0001',
	details: [{ label: 'Fare', value: 'Sparpreis' }]
};

const periodTrip: TripSummary = {
	shape: 'period',
	issuer: 'Test Verbund',
	product: 'Test area pass',
	validFrom: '2026-09-01T00:00',
	validUntil: '2026-09-30T23:59',
	ticketId: '4242',
	details: []
};

const assets = {
	'icon.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
	'icon@2x.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6])
};

async function identity(options?: Parameters<typeof testCertificate>[0]) {
	const cert = testCertificate(options);
	return { cert, identity: await loadIdentity(cert.certificatePem, cert.privateKeyPem) };
}

const files = (pass: Uint8Array) => unzipSync(pass);

describe('signing identity', () => {
	it('takes the pass type and team identifiers out of the certificate', async () => {
		const { identity: id } = await identity();
		expect(id.passTypeIdentifier).toBe('pass.test.ticketish');
		expect(id.teamIdentifier).toBe('TEAMID1234');
		expect(identityProblem(id)).toBeNull();
	});

	it('refuses a key that does not belong to the certificate', async () => {
		const cert = testCertificate();
		await expect(loadIdentity(cert.certificatePem, otherKeyPem())).rejects.toThrow(
			/does not belong/
		);
	});

	it('refuses a certificate that is not a Pass Type ID one', async () => {
		const cert = testCertificate({ passTypeIdentifier: '' });
		await expect(loadIdentity(cert.certificatePem, cert.privateKeyPem)).rejects.toThrow(
			/not a Pass Type ID certificate/
		);
	});

	it('says so when the certificate has expired rather than signing anyway', async () => {
		const { identity: id } = await identity({
			notBefore: new Date('2020-01-01T00:00:00Z'),
			notAfter: new Date('2021-01-01T00:00:00Z')
		});
		expect(identityProblem(id)).toMatch(/expired on 2021-01-01/);
	});

	it('names the passphrase problem instead of failing to parse', async () => {
		const cert = testCertificate();
		const encrypted = '-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----';
		await expect(loadIdentity(cert.certificatePem, encrypted)).rejects.toThrow(/passphrase/);
	});
});

describe('pass structure', () => {
	it('holds a manifest whose digests match every other file', async () => {
		const { identity: id } = await identity();
		const pass = await buildPkpass({
			trip,
			payload: binaryPayload(),
			symbology: AZTEC,
			identity: id,
			assets
		});
		const entries = files(pass);
		expect(Object.keys(entries).sort()).toEqual([
			'icon.png',
			'icon@2x.png',
			'manifest.json',
			'pass.json',
			'signature'
		]);

		const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as Record<string, string>;
		expect(Object.keys(manifest).sort()).toEqual([
			'icon.png',
			'icon@2x.png',
			'pass.json'
		]);
		for (const [name, digest] of Object.entries(manifest)) {
			expect(digest).toBe(hex(sha1(entries[name])));
		}
	});

	it('writes a boarding pass for a journey and a generic pass for a period', async () => {
		const { identity: id } = await identity();
		const journey = JSON.parse(
			strFromU8(
				files(
					await buildPkpass({ trip, payload: binaryPayload(), symbology: AZTEC, identity: id, assets })
				)['pass.json']
			)
		);
		expect(journey.boardingPass.transitType).toBe('PKTransitTypeTrain');
		expect(journey.boardingPass.primaryFields.map((f: { value: string }) => f.value)).toEqual([
			'Alpha Hbf',
			'Beta Hbf'
		]);
		expect(journey.passTypeIdentifier).toBe('pass.test.ticketish');
		expect(journey.teamIdentifier).toBe('TEAMID1234');
		expect(journey.relevantDate).toBe('2026-09-01T08:15:00Z');

		const period = JSON.parse(
			strFromU8(
				files(
					await buildPkpass({
						trip: periodTrip,
						payload: binaryPayload(),
						symbology: AZTEC,
						identity: id,
						assets
					})
				)['pass.json']
			)
		);
		expect(period.generic).toBeDefined();
		expect(period.boardingPass).toBeUndefined();
		expect(period.expirationDate).toBe('2026-09-30T23:59:00Z');
	});

	it('takes the operator colour, and the app palette without one', async () => {
		const { identity: id } = await identity();
		const colored = { ...trip, operator: { scheme: 'rics' as const, code: 1080 } };
		const passOf = async (t: TripSummary) =>
			JSON.parse(
				strFromU8(
					files(
						await buildPkpass({
							trip: t,
							payload: binaryPayload(),
							symbology: AZTEC,
							identity: id,
							assets
						})
					)['pass.json']
				)
			);
		expect((await passOf(colored)).backgroundColor).toBe('rgb(238, 0, 32)');
		expect((await passOf(colored)).foregroundColor).toBe('rgb(255, 255, 255)');
		expect((await passOf(trip)).backgroundColor).toBe('rgb(38, 50, 75)');
	});

	it('says on the front and on the back that it is not the issuer own pass', async () => {
		const { identity: id } = await identity();
		const pass = JSON.parse(
			strFromU8(
				files(
					await buildPkpass({
						trip,
						payload: binaryPayload(),
						symbology: AZTEC,
						identity: id,
						assets
					})
				)['pass.json']
			)
		);
		expect(pass.organizationName).toBe('ticketish | Test Railways');
		const back = pass.boardingPass.backFields as { key: string; value: string }[];
		const note = back.find((f) => f.key === 'unofficial')!;
		expect(note.value).toMatch(/Not issued by the operator/);
	});

	it('gives the same ticket the same serial, so a re-export replaces it', async () => {
		const payload = binaryPayload();
		expect(serialForPayload(payload)).toBe(serialForPayload(binaryPayload()));
		expect(serialForPayload(payload)).not.toBe(serialForPayload(new Uint8Array([1, 2, 3])));
	});

	it('names the file after the trip', () => {
		expect(pkpassFileName(trip)).toBe('alpha-hbf-to-beta-hbf.pkpass');
	});

	it('refuses a symbology Apple cannot draw instead of substituting one', async () => {
		const { identity: id } = await identity();
		expect(barcodeProblem({ format: 'DataMatrix' })).toMatch(/cannot show a DataMatrix/);
		await expect(
			buildPkpass({
				trip,
				payload: binaryPayload(),
				symbology: { format: 'DataMatrix' },
				identity: id,
				assets
			})
		).rejects.toThrow(/DataMatrix/);
	});
});

describe('the barcode survives the round trip', () => {
	it('comes back byte for byte through the app own pkpass reader', async () => {
		const payload = binaryPayload();
		const { identity: id } = await identity();
		const pass = await buildPkpass({ trip, payload, symbology: AZTEC, identity: id, assets });

		const read = readPkpass(pass);
		expect(read.hits).toHaveLength(1);
		expect(read.hits[0].format).toBe('Aztec');
		expect([...read.hits[0].bytes]).toEqual([...payload]);
	});

	it('carries every byte value as one Latin-1 character', () => {
		const message = latin1Message(binaryPayload());
		expect(message.length).toBe(256);
		expect([...message].every((c) => c.charCodeAt(0) < 256)).toBe(true);
	});
});

describe('the signature', () => {
	it('verifies against the manifest it was made for', async () => {
		const { cert, identity: id } = await identity();
		const pass = await buildPkpass({
			trip,
			payload: binaryPayload(),
			symbology: AZTEC,
			identity: id,
			assets,
			signedAt: new Date('2026-08-03T10:00:00Z')
		});
		const entries = files(pass);
		const signature = entries['signature'];
		const manifest = entries['manifest.json'];

		// ContentInfo { signedData OID, [0] SignedData }
		const contentInfo = children(readNode(signature));
		expect(oidString(contentInfo[0])).toBe('1.2.840.113549.1.7.2');
		const signedData = children(children(contentInfo[1])[0]);

		// certificates [0] holds the signer and the WWDR intermediate
		const certificates = children(signedData.find((n) => n.tag === 0xa0)!);
		expect(certificates).toHaveLength(2);
		expect(hex(certificates[0].encoded)).toBe(hex(cert.der));
		expect(new X509Certificate(Buffer.from(certificates[1].encoded)).subject).toContain(
			'Apple Worldwide Developer Relations'
		);

		// detached: encapContentInfo names the content type and carries nothing
		const encap = children(signedData[2]);
		expect(encap).toHaveLength(1);
		expect(oidString(encap[0])).toBe('1.2.840.113549.1.7.1');

		const signerInfo = children(children(signedData[signedData.length - 1])[0]);
		const signedAttrs = signerInfo.find((n) => n.tag === 0xa0)!;
		const signatureValue = signerInfo[signerInfo.length - 1];

		// the digest attribute has to be of the manifest actually shipped
		const attributes = children(signedAttrs).map((a) => children(a));
		const digestAttr = attributes.find((a) => oidString(a[0]) === '1.2.840.113549.1.9.4')!;
		const digest = children(digestAttr[1])[0];
		expect(hex(digest.content)).toBe(
			hex(new Uint8Array(await crypto.subtle.digest('SHA-256', manifest as BufferSource)))
		);
		const timeAttr = attributes.find((a) => oidString(a[0]) === '1.2.840.113549.1.9.5')!;
		expect(new TextDecoder().decode(children(timeAttr[1])[0].content)).toBe('260803100000Z');

		// what was signed is the attributes as a SET OF, not as the [0] they
		// travel in: rebuild that and check the RSA signature over it
		const signed = tlv(TAG.set, signedAttrs.content);
		const verifier = createVerify('sha256');
		verifier.update(Buffer.from(signed));
		expect(verifier.verify(cert.publicKeyPem, Buffer.from(signatureValue.content))).toBe(true);

		// and it must not verify over anything else
		const tampered = createVerify('sha256');
		tampered.update(Buffer.from(signedAttrs.encoded));
		expect(tampered.verify(cert.publicKeyPem, Buffer.from(signatureValue.content))).toBe(false);
	});

	it('is a signature openssl also accepts', async () => {
		const openssl = hasOpenssl();
		if (!openssl) return;

		const { cert, identity: id } = await identity();
		const pass = await buildPkpass({
			trip,
			payload: binaryPayload(),
			symbology: AZTEC,
			identity: id,
			assets
		});
		const entries = files(pass);
		const dir = mkdtempSync(join(tmpdir(), 'ticketish-pass-'));
		writeFileSync(join(dir, 'signature'), entries['signature']);
		writeFileSync(join(dir, 'manifest.json'), entries['manifest.json']);
		writeFileSync(join(dir, 'cert.pem'), cert.certificatePem);

		// the test certificate is its own root, so it is both signer and anchor.
		// -binary matters: without it openssl canonicalises the content's line
		// endings before digesting, which is an S/MIME rule and not one a pass
		// manifest was signed under.
		const output = execFileSync(
			'openssl',
			[
				'cms',
				'-verify',
				'-binary',
				'-inform',
				'DER',
				'-in',
				join(dir, 'signature'),
				'-content',
				join(dir, 'manifest.json'),
				'-CAfile',
				join(dir, 'cert.pem'),
				'-purpose',
				'any',
				'-out',
				'/dev/null'
			],
			{ cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		expect(output).toBe('');
	});
});

function hasOpenssl(): boolean {
	try {
		execFileSync('openssl', ['version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
