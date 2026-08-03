// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The user's Apple pass signing identity: a certificate and its private key,
 * read from PEM and handed to WebCrypto.
 *
 * PEM rather than the .p12 Keychain exports, because WebCrypto cannot open a
 * PKCS#12 and opening one by hand means implementing the password based
 * ciphers Apple's export uses. One `openssl` command converts it, and that
 * command is in the UI next to the file pickers. This is the one place where
 * the app asks the reader to do something on a command line, and it buys a
 * signing path with no crypto library in it.
 *
 * What is read out of the certificate matters as much as the key: a pass
 * carries a passTypeIdentifier and a teamIdentifier, and Wallet refuses the
 * pass if they do not match the certificate that signed it. Apple puts both in
 * the subject, so they are taken from there rather than typed in, and cannot
 * disagree.
 */
import {
	children,
	derString,
	derTime,
	nullValue,
	octetString,
	oid,
	oidString,
	readNode,
	sequence,
	TAG,
	type DerNode
} from './der.ts';
import type { CmsSigner } from './cms.ts';
import { WWDR_G4_BASE64, WWDR_G4_EXPIRES } from './wwdr.ts';

const SUBJECT_OID = {
	commonName: '2.5.4.3',
	organizationalUnit: '2.5.4.11',
	organization: '2.5.4.10',
	userId: '0.9.2342.19200300.100.1.1'
} as const;

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64.replace(/\s+/g, ''));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	// chunked so a long certificate does not blow the argument limit
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** Every PEM block in `text` with the given label, as DER. */
export function pemBlocks(text: string, label: string): Uint8Array[] {
	const pattern = new RegExp(
		`-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+?)-----END ${label}-----`,
		'g'
	);
	return [...text.matchAll(pattern)].map((m) => base64ToBytes(m[1]));
}

/** What the certificate says about itself, and what a pass has to repeat. */
export interface CertificateInfo {
	der: Uint8Array;
	/** The issuer Name, still DER encoded: the signature quotes it verbatim. */
	issuer: Uint8Array;
	serialNumber: Uint8Array;
	notBefore: Date | null;
	notAfter: Date | null;
	commonName?: string;
	/** Subject UID, which is the pass type identifier on an Apple pass cert. */
	passTypeIdentifier?: string;
	/** Subject OU, which is the team identifier. */
	teamIdentifier?: string;
	organization?: string;
	/** The RSA modulus, for checking that the key belongs to this certificate. */
	modulus: Uint8Array;
}

/** Strip a DER INTEGER's leading zero, so two encodings can be compared. */
const unpadded = (bytes: Uint8Array) => (bytes[0] === 0 ? bytes.subarray(1) : bytes);

/**
 * Read the fields a pass signature needs out of an X.509 certificate.
 *
 * Only the parts on the way to those fields are decoded. A certificate is a
 * SEQUENCE holding a TBSCertificate, and the TBSCertificate is a fixed run of
 * fields with an optional version tag in front of it, so finding the serial
 * number, the two Names, the validity and the public key is a matter of
 * counting past that tag.
 */
export function readCertificate(der: Uint8Array): CertificateInfo {
	const certificate = readNode(der);
	if (certificate.tag !== TAG.sequence) throw new Error('not a certificate');
	const tbs = children(certificate)[0];
	if (!tbs || tbs.tag !== TAG.sequence) throw new Error('certificate has no body');

	const fields = children(tbs);
	// [0] EXPLICIT version is optional and everything else counts from it
	let i = fields[0]?.tag === 0xa0 ? 1 : 0;
	const serial = fields[i++];
	i++; // signature algorithm
	const issuer = fields[i++];
	const validity = fields[i++];
	const subject = fields[i++];
	const spki = fields[i++];
	if (!serial || !issuer || !validity || !subject || !spki) {
		throw new Error('certificate body is shorter than X.509 allows');
	}

	const [notBefore, notAfter] = children(validity).map(derTime);
	const info: CertificateInfo = {
		der,
		issuer: issuer.encoded,
		serialNumber: serial.content,
		notBefore: notBefore ?? null,
		notAfter: notAfter ?? null,
		modulus: rsaModulus(spki)
	};

	for (const rdn of children(subject)) {
		for (const pair of children(rdn)) {
			const [type, value] = children(pair);
			if (!type || !value) continue;
			const text = derString(value);
			switch (oidString(type)) {
				case SUBJECT_OID.commonName:
					info.commonName = text;
					break;
				case SUBJECT_OID.userId:
					info.passTypeIdentifier = text;
					break;
				case SUBJECT_OID.organizationalUnit:
					info.teamIdentifier = text;
					break;
				case SUBJECT_OID.organization:
					info.organization = text;
					break;
			}
		}
	}
	return info;
}

/** The modulus inside a SubjectPublicKeyInfo, for the key matching check. */
function rsaModulus(spki: DerNode): Uint8Array {
	const bitString = children(spki)[1];
	if (!bitString || bitString.tag !== TAG.bitString) throw new Error('no public key');
	// the first content byte of a BIT STRING counts unused trailing bits
	const key = readNode(bitString.content.subarray(1));
	const modulus = children(key)[0];
	if (!modulus) throw new Error('public key has no modulus');
	return unpadded(modulus.content);
}

/**
 * A PKCS#1 RSAPrivateKey wrapped as the PKCS#8 PrivateKeyInfo that WebCrypto
 * takes. Older openssl writes the PKCS#1 form, and rewriting the wrapper is
 * cheaper than telling someone their key is the wrong shape of the same key.
 */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
	return sequence(
		new Uint8Array([TAG.integer, 0x01, 0x00]),
		sequence(oid('1.2.840.113549.1.1.1'), nullValue()),
		octetString(pkcs1)
	);
}

const KEY_ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

/**
 * Import an RSA signing key from PEM, for anything that signs with SHA-256:
 * the pass certificate's key here, and a Google service account's key in
 * `google.ts`. The key that comes back cannot be exported again; the modulus
 * alongside it is read from a throwaway extractable import, which is what
 * lets the caller check that a key and a certificate belong together.
 */
export async function importPrivateKey(
	pem: string
): Promise<{ key: CryptoKey; modulus: Uint8Array }> {
	if (/BEGIN ENCRYPTED PRIVATE KEY/.test(pem)) {
		throw new Error(
			'this key is passphrase protected. Decrypt it first: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-decrypted.pem'
		);
	}
	const [pkcs8] = pemBlocks(pem, 'PRIVATE KEY');
	const [pkcs1] = pemBlocks(pem, 'RSA PRIVATE KEY');
	const der = pkcs8 ?? (pkcs1 ? pkcs1ToPkcs8(pkcs1) : undefined);
	if (!der) throw new Error('no private key found in this file');

	let checkable: CryptoKey;
	try {
		checkable = await crypto.subtle.importKey('pkcs8', der as BufferSource, KEY_ALGORITHM, true, [
			'sign'
		]);
	} catch {
		throw new Error('this private key is not an RSA key WebCrypto can use');
	}
	const jwk = await crypto.subtle.exportKey('jwk', checkable);
	const key = await crypto.subtle.importKey('pkcs8', der as BufferSource, KEY_ALGORITHM, false, [
		'sign'
	]);
	return { key, modulus: base64ToBytes((jwk.n ?? '').replace(/-/g, '+').replace(/_/g, '/')) };
}

/** A certificate and key that belong together, ready to sign passes. */
export interface SigningIdentity {
	certificate: CertificateInfo;
	signer: CmsSigner;
	passTypeIdentifier: string;
	teamIdentifier: string;
	/** What to show so the reader can tell which identity is loaded. */
	label: string;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Build a signing identity from a certificate PEM and a key PEM.
 *
 * Everything that can be checked here is checked here, because the
 * alternative is Wallet refusing the finished pass with no reason given.
 */
export async function loadIdentity(certPem: string, keyPem: string): Promise<SigningIdentity> {
	const [certDer] = pemBlocks(certPem, 'CERTIFICATE');
	if (!certDer) throw new Error('no certificate found in this file');
	const certificate = readCertificate(certDer);

	const { key, modulus } = await importPrivateKey(keyPem);
	if (!sameBytes(modulus, certificate.modulus)) {
		throw new Error('this private key does not belong to this certificate');
	}
	return identityFrom(certDer, key);
}

/**
 * The same identity from parts that have already been through `loadIdentity`
 * once. This is what restoring a remembered credential goes through: the key
 * comes back out of storage as a `CryptoKey` and never was a PEM here, so the
 * certificate matching is not repeated, only the checks the certificate can
 * still fail on its own.
 */
export function identityFrom(certDer: Uint8Array, key: CryptoKey): SigningIdentity {
	const certificate = readCertificate(certDer);
	if (!certificate.passTypeIdentifier || !certificate.teamIdentifier) {
		throw new Error(
			'this certificate is not a Pass Type ID certificate: it carries no pass type identifier'
		);
	}

	return {
		certificate,
		signer: {
			certificate: certDer,
			chain: [base64ToBytes(WWDR_G4_BASE64)],
			issuer: certificate.issuer,
			serialNumber: certificate.serialNumber,
			key
		},
		passTypeIdentifier: certificate.passTypeIdentifier,
		teamIdentifier: certificate.teamIdentifier,
		label: certificate.commonName ?? certificate.passTypeIdentifier
	};
}

/**
 * Why this identity cannot sign a pass right now, or null when it can.
 *
 * Expiry is the interesting case and it has two halves: the user's own
 * certificate, which Apple issues for a year, and the bundled intermediate,
 * which outlives it but not forever.
 */
export function identityProblem(identity: SigningIdentity, now: Date = new Date()): string | null {
	const { notBefore, notAfter } = identity.certificate;
	if (notBefore && now < notBefore) {
		return `this certificate is not valid until ${notBefore.toISOString().slice(0, 10)}`;
	}
	if (notAfter && now > notAfter) {
		return `this certificate expired on ${notAfter.toISOString().slice(0, 10)}`;
	}
	if (now > new Date(`${WWDR_G4_EXPIRES}T00:00:00Z`)) {
		return `the bundled Apple WWDR intermediate expired on ${WWDR_G4_EXPIRES}, so this build can no longer sign passes`;
	}
	return null;
}
