// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The detached PKCS#7 signature that turns a folder into a .pkpass.
 *
 * Apple's format is a CMS SignedData (RFC 5652) over the bytes of
 * manifest.json, with the content left out of the structure, the signing
 * certificate and Apple's WWDR intermediate carried inside it, and three
 * signed attributes: the content type, the digest of the manifest, and the
 * time of signing. Wallet builds the chain to the Apple root itself, which is
 * why the root is not included and the intermediate is.
 *
 * WebCrypto does the RSA signature and the SHA-256 digests. Everything around
 * them is structure, written out with `der.ts`. That is the whole reason this
 * file is short enough to be worth having instead of a PKI library: the only
 * cryptography here is two calls into the platform.
 *
 * The signature covers the DER encoding of the signed attributes as a SET OF
 * (tag 0x31), not as the [0] IMPLICIT they appear as inside the SignerInfo.
 * That is what RFC 5652 section 5.4 requires and it is the detail that breaks
 * signatures quietly when it is missed, so the two encodings are built from
 * one sorted list rather than assembled twice.
 */
import {
	concat,
	explicit,
	implicitConstructed,
	integer,
	integerBytes,
	nullValue,
	octetString,
	oid,
	sequence,
	setOf,
	TAG,
	tlv,
	utcTime
} from './der.ts';

const OID = {
	signedData: '1.2.840.113549.1.7.2',
	data: '1.2.840.113549.1.7.1',
	sha256: '2.16.840.1.101.3.4.2.1',
	rsaEncryption: '1.2.840.113549.1.1.1',
	contentType: '1.2.840.113549.1.9.3',
	messageDigest: '1.2.840.113549.1.9.4',
	signingTime: '1.2.840.113549.1.9.5'
} as const;

/** SEQUENCE { OID, NULL }, the shape both algorithms are named with here. */
const algorithm = (id: string) => sequence(oid(id), nullValue());

/** Attribute ::= SEQUENCE { attrType OID, attrValues SET OF ANY } */
const attribute = (type: string, value: Uint8Array) => sequence(oid(type), tlv(TAG.set, value));

/** What signing needs from the user's certificate and key. */
export interface CmsSigner {
	/** The signing certificate, DER encoded, copied into the signature as is. */
	certificate: Uint8Array;
	/** Intermediates to carry along, in this case Apple's WWDR. */
	chain: Uint8Array[];
	/** The issuer Name, DER encoded, taken straight out of the certificate. */
	issuer: Uint8Array;
	/** The serial number's INTEGER content bytes, likewise. */
	serialNumber: Uint8Array;
	/** An RSASSA-PKCS1-v1_5 private key, imported for SHA-256. */
	key: CryptoKey;
}

const digest = async (data: Uint8Array) =>
	new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));

/**
 * A detached CMS SignedData over `content`, DER encoded.
 *
 * `signedAt` is the timestamp that goes into the signing-time attribute. It is
 * a parameter rather than a call to the clock so that a test can produce the
 * same bytes twice.
 */
export async function signDetached(
	content: Uint8Array,
	signer: CmsSigner,
	signedAt: Date = new Date()
): Promise<Uint8Array> {
	const messageDigest = await digest(content);

	const signedAttrs = [
		attribute(OID.contentType, oid(OID.data)),
		attribute(OID.signingTime, utcTime(signedAt)),
		attribute(OID.messageDigest, octetString(messageDigest))
	];
	// sorted once: signed as a SET OF, carried as a [0] IMPLICIT of the same
	const attrsDer = setOf(...signedAttrs);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			'RSASSA-PKCS1-v1_5',
			signer.key,
			attrsDer as unknown as BufferSource
		)
	);
	const attrsImplicit = implicitConstructed(0, attrsDer.subarray(headerLength(attrsDer)));

	const signerInfo = sequence(
		integer(1),
		sequence(signer.issuer, integerBytes(signer.serialNumber)),
		algorithm(OID.sha256),
		attrsImplicit,
		algorithm(OID.rsaEncryption),
		octetString(signature)
	);

	const certificates = implicitConstructed(
		0,
		concat([signer.certificate, ...signer.chain])
	);

	const signedData = sequence(
		integer(1),
		setOf(algorithm(OID.sha256)),
		// encapContentInfo with no eContent: this is what "detached" means
		sequence(oid(OID.data)),
		certificates,
		setOf(signerInfo)
	);

	return sequence(oid(OID.signedData), explicit(0, signedData));
}

/** How many bytes of a TLV are header, so the content can be re-tagged. */
function headerLength(node: Uint8Array): number {
	const length = node[1];
	return length & 0x80 ? 2 + (length & 0x7f) : 2;
}
