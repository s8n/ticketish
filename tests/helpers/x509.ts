// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A throwaway pass signing certificate, built here rather than checked in.
 *
 * Signing a pass needs a certificate that looks like Apple's: an RSA key, and
 * a subject carrying the pass type identifier as a UID and the team
 * identifier as an OU. Rather than commit one, or shell out to openssl, the
 * tests write one with the same DER encoder the signature uses. The key is
 * generated per run and is good for nothing else.
 *
 * Writing the certificate with our own encoder does mean the encoder is
 * checked against itself here, so the tests that matter read the result back
 * with node's own X.509 parser as well.
 */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
	concat,
	integer,
	nullValue,
	oid,
	sequence,
	setOf,
	TAG,
	tlv,
	utcTime
} from '../../src/lib/wallet/der.ts';

const OID = {
	commonName: '2.5.4.3',
	organizationalUnit: '2.5.4.11',
	organization: '2.5.4.10',
	userId: '0.9.2342.19200300.100.1.1',
	sha256WithRsa: '1.2.840.113549.1.1.11'
};

const utf8String = (text: string) => tlv(TAG.utf8String, new TextEncoder().encode(text));

/** One RDN: a SET holding a single type and value, which is the usual shape. */
const rdn = (type: string, value: string) => setOf(sequence(oid(type), utf8String(value)));

const name = (parts: [string, string][]) => sequence(...parts.map(([t, v]) => rdn(t, v)));

/** A BIT STRING with no unused trailing bits, which is how DER carries keys. */
const bitString = (content: Uint8Array) =>
	tlv(TAG.bitString, concat([new Uint8Array([0]), content]));

export interface TestCertificate {
	/** The certificate, DER encoded. */
	der: Uint8Array;
	certificatePem: string;
	privateKeyPem: string;
	privateKey: KeyObject;
	publicKeyPem: string;
	passTypeIdentifier: string;
	teamIdentifier: string;
}

function pem(label: string, der: Uint8Array): string {
	const base64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
	return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
}

/**
 * A self-signed certificate with an Apple-shaped subject. `notBefore` and
 * `notAfter` are parameters so a test can build an expired one.
 */
export function testCertificate({
	passTypeIdentifier = 'pass.test.ticketish',
	teamIdentifier = 'TEAMID1234',
	commonName = 'Pass Type ID: pass.test.ticketish',
	notBefore = new Date('2020-01-01T00:00:00Z'),
	notAfter = new Date('2040-01-01T00:00:00Z')
}: {
	passTypeIdentifier?: string;
	teamIdentifier?: string;
	commonName?: string;
	notBefore?: Date;
	notAfter?: Date;
} = {}): TestCertificate {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const spki = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }));

	const subject = name([
		[OID.userId, passTypeIdentifier],
		[OID.commonName, commonName],
		[OID.organizationalUnit, teamIdentifier],
		[OID.organization, 'ticketish tests']
	]);
	const algorithm = sequence(oid(OID.sha256WithRsa), nullValue());

	const tbs = sequence(
		tlv(0xa0, integer(2)), // [0] EXPLICIT version v3
		integer(0x1234),
		algorithm,
		subject, // self-signed: issuer is the subject
		sequence(utcTime(notBefore), utcTime(notAfter)),
		subject,
		spki
	);

	const signature = new Uint8Array(sign('sha256', tbs, privateKey));
	const der = sequence(tbs, algorithm, bitString(signature));

	return {
		der,
		certificatePem: pem('CERTIFICATE', der),
		privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
		publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }) as string,
		privateKey,
		passTypeIdentifier,
		teamIdentifier
	};
}

/** A second key, for the test that a mismatched key is caught. */
export function otherKeyPem(): string {
	const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	return privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
}
