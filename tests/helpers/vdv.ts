/**
 * Builds a complete synthetic VDV barcode: a ticket body, an issuer CV
 * certificate signed by a throwaway CA key, and the ISO 9796-2 signature over
 * the ticket. Nothing here comes from a real ticket.
 */
import { concat, signIso9796, testKey, tlv, type TestKey } from './build.ts';
import type { VdvCaKeyStore } from '../../src/lib/tickets/vdv/vdv.ts';

const CA_REFERENCE = 'DE/VDV/1/1/9/2029';

/** Bytes of a CA reference: country, issuer, indicators, serial, BCD year. */
function caReferenceBytes(): Uint8Array {
	const out = new Uint8Array(8);
	out.set([...'DE'].map((c) => c.charCodeAt(0)), 0);
	out.set([...'VDV'].map((c) => c.charCodeAt(0)), 2);
	out[5] = (1 << 4) | 1; // service indicator 1, discretionary data 1
	out[6] = 9; // serial
	out[7] = 0x29; // BCD 29 -> 2029
	return out;
}

/**
 * CV certificate content. The parser walks past a variable length OID from
 * offset 32, so the exponent must be exactly four bytes for the end of the
 * OID to be unambiguous.
 */
function certificateContent(issuer: TestKey, holderName: string): Uint8Array {
	const oid = new Uint8Array([0x2b, 0x24, 0x03, 0x05, 0x02, 0x02, 0x01]);
	const modulus = Buffer.from(issuer.modulusHex, 'hex');
	const exponent = Buffer.from(issuer.exponentHex.padStart(8, '0'), 'hex');

	const content = new Uint8Array(32 + oid.length + modulus.length + exponent.length);
	content[0] = 4; // profile 4 -> 128 byte modulus
	content.set(caReferenceBytes(), 1);
	// certificate holder reference, 12 bytes
	content.set(new Uint8Array([0, 0, 0, 0, ...caReferenceBytes()]), 9);
	content.set([...holderName.padEnd(6, ' ')].map((c) => c.charCodeAt(0)), 21);
	content[27] = 0x21; // holder authorisation
	content.set([0x20, 0x29, 0x12, 0x31], 28); // expiry, BCD
	content.set(oid, 32);
	content.set(modulus, 32 + oid.length);
	content.set(exponent, 32 + oid.length + modulus.length);
	return content;
}

export interface VdvTicketParts {
	/** 18 byte header: ticket id, orgs, product, validity. */
	header: Uint8Array;
	/** Product data elements, already TLV encoded. */
	productData: Uint8Array;
	commonTransaction?: Uint8Array;
	issueData?: Uint8Array;
}

/** VDV compact date-time. */
export function vdvDateTime(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second = 0
): Uint8Array {
	return new Uint8Array([
		((year - 1990) << 1) | ((month >> 3) & 0x01),
		((month << 5) & 0xe0) | (day & 0x1f),
		((hour << 3) & 0xf8) | ((minute >> 3) & 0x07),
		((minute << 5) & 0xe0) | ((second / 2) & 0x1f)
	]);
}

export function vdvHeader({
	ticketId,
	ticketOrgId,
	productNumber,
	productOrgId,
	validFrom,
	validUntil
}: {
	ticketId: number;
	ticketOrgId: number;
	productNumber: number;
	productOrgId: number;
	validFrom: Uint8Array;
	validUntil: Uint8Array;
}): Uint8Array {
	const out = new Uint8Array(18);
	const view = new DataView(out.buffer);
	view.setUint32(0, ticketId);
	view.setUint16(4, ticketOrgId);
	view.setUint16(6, productNumber);
	view.setUint16(8, productOrgId);
	out.set(validFrom, 10);
	out.set(validUntil, 14);
	return out;
}

const MINIMUM_LENGTH = 111;

/** Assemble the message the signature recovers. */
export function vdvTicketMessage(parts: VdvTicketParts): Uint8Array {
	const commonTransaction = parts.commonTransaction ?? new Uint8Array(17);
	const issueData = parts.issueData ?? new Uint8Array(12);
	const trailer = new Uint8Array([0x56, 0x44, 0x56, 0x11, 0x07]); // "VDV" + version 1.10.7

	const assemble = (productData: Uint8Array) =>
		concat(
			parts.header,
			tlv(0x85, productData),
			commonTransaction,
			tlv(0x8a, new Uint8Array(4)),
			issueData,
			trailer
		);

	let message = assemble(parts.productData);
	if (message.length < MINIMUM_LENGTH) {
		// Real tickets are longer; pad with an all zero private element, which
		// the parser skips, rather than distorting the fields under test.
		const filler = Math.max(0, MINIMUM_LENGTH - message.length - 2);
		message = assemble(concat(parts.productData, tlv(0xde, new Uint8Array(filler))));
	}
	return message;
}

export interface BuiltVdv {
	barcode: Uint8Array;
	caKeys: VdvCaKeyStore;
	caReference: string;
	holderName: string;
}

/** A complete VDV barcode plus the CA key store needed to read it. */
export function buildVdv(parts: VdvTicketParts, { holderName = 'TESTCA' } = {}): BuiltVdv {
	const ca = testKey();
	const issuer = testKey();

	const content = certificateContent(issuer, holderName);
	const certSignature = signIso9796(content, ca);
	const certificate = tlv(
		0x7f21,
		concat(tlv(0x5f37, certSignature.signature), tlv(0x5f38, certSignature.remainder))
	);

	const message = vdvTicketMessage(parts);
	const ticketSignature = signIso9796(message, issuer);

	const barcode = concat(
		tlv(0x9e, ticketSignature.signature),
		tlv(0x9a, ticketSignature.remainder),
		certificate,
		tlv(0x42, caReferenceBytes())
	);

	return {
		barcode,
		caReference: CA_REFERENCE,
		holderName,
		caKeys: {
			[CA_REFERENCE]: {
				name: holderName,
				profile: 4,
				modulus_hex: ca.modulusHex,
				exponent_hex: ca.exponentHex
			}
		}
	};
}

/** Wrap a VDV envelope in a Giesecke+Devrient style MOTICS container. */
export function wrapMotics(barcode: Uint8Array, identifier = 'G&D'): Uint8Array {
	return concat(
		tlv(0x5f01, new Uint8Array([...identifier].map((c) => c.charCodeAt(0)))),
		tlv(0x5f02, new Uint8Array([1])),
		tlv(0x7f07, barcode)
	);
}
