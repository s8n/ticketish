// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: EUPL-1.2
// Ported from zuegli (EUPL-1.2), so it cannot also be offered under MIT.

/**
 * VDV-KA barcode tickets (German Verbund / Deutschlandticket).
 *
 * The barcode is a BER-TLV envelope holding an ISO 9796-2 signature with
 * message recovery (tag 9E) plus the residual data (9A), the issuer's CV
 * certificate (7F21) and the CA reference (42). Recovering the CV
 * certificate with the CA's public key yields the issuer key, which in turn
 * recovers the ticket itself. Some issuers wrap all of that in a MOTICS
 * copy-protection container.
 *
 * Structures ported from zuegli's main/vdv (EUPL-1.2). CA public keys are
 * built from VDV's public LDAP directory by scripts/build-vdv-keys.py.
 */
import caKeys from './ca-keys.json' with { type: 'json' };
import { parseFirstTlv, parseTlv, tlvMap } from './tlv.ts';
import { sha1 } from './sha1.ts';
import { bigIntToBytes, bytesToBigInt, modPow } from '../bigint.ts';
import { ascii, hex, isPrintableAscii } from '../bytes.ts';
import { isoDate, pad } from '../dates.ts';

export interface CaKey {
	name: string;
	profile: number;
	modulus_hex: string;
	exponent_hex: string;
}

/** Key store, overridable so tests can sign with their own throwaway key. */
export type VdvCaKeyStore = Record<string, CaKey>;

const CA_KEYS = caKeys as unknown as VdvCaKeyStore;

const TAG_SIGNATURE = 0x9e;
const TAG_REMAINDER = 0x9a;
const TAG_CERTIFICATE = 0x7f21;
const TAG_CA_REFERENCE = 0x42;
const TAG_MULTIPLE_AUTHORIZATIONS = 0xef;
const TAG_NUMBER_AUTHORIZATIONS = 0x90;
const TAG_CERT_CONTENT = 0x5f4e;
const TAG_CERT_SIGNATURE = 0x5f37;
const TAG_CERT_REMAINDER = 0x5f38;
const TAG_COPY_PROTECTION = 0x7f70;
const TAG_MOTICS_APP_DATA = 0x5f77;
// Giesecke+Devrient style container: flat 5F01..5F09 with the VDV envelope in 7F07
const TAG_GD_APP_DATA = 0x7f07;
const TAG_GD_IDENTIFIER = 0x5f01;

const MODULUS_LEN: Record<number, number> = { 3: 192, 4: 128, 5: 128, 6: 128, 7: 248 };

export interface VdvProductDataElement {
	tag: number;
	name: string;
	data: Record<string, unknown> | null;
	/** Set for the passenger element, which gets its own presentation. */
	passenger?: VdvPassenger;
	/**
	 * Readable form of an element whose bytes are ASCII text. Only filled in
	 * for the identification medium inside a MOTICS container, where the
	 * value is the secure element's identifier written out as characters.
	 */
	text?: string;
	hex: string;
}

export interface VdvTicket {
	version: string;
	ticketId: number;
	ticketOrgId: number;
	productNumber: number;
	productOrgId: number;
	validityStart: string;
	validityEnd: string;
	kvpOrgId: number;
	terminalType: number;
	terminalNumber: number;
	terminalOwnerId: number;
	transactionTime: string | null;
	locationType: number;
	locationNumber: number;
	locationOrgId: number;
	samId: number;
	samVersion: number;
	productData: VdvProductDataElement[];
}

export interface VdvBarcode {
	container: 'plain' | 'motics';
	containerIdentifier?: string;
	caReference: string | null;
	certificateHolder: string | null;
	recovered: boolean;
	error?: string;
	tickets: VdvTicket[];
	payloadHex?: string;
}

/** ISO 9796-2 scheme 2 message recovery: returns the full message or null. */
function recover(
	signature: Uint8Array,
	remainder: Uint8Array,
	modulusHex: string,
	exponentHex: string
): Uint8Array | null {
	const modulus = BigInt('0x' + modulusHex);
	const modulusLen = modulusHex.length / 2;
	const m = modPow(bytesToBigInt(signature), BigInt('0x' + exponentHex), modulus);
	const data = bigIntToBytes(m, modulusLen);
	if (data[0] !== 0x6a || data[data.length - 1] !== 0xbc) return null;
	const body = data.subarray(1, data.length - 21);
	const digest = data.subarray(data.length - 21, data.length - 1);
	const message = new Uint8Array(body.length + remainder.length);
	message.set(body);
	message.set(remainder, body.length);
	const actual = sha1(message);
	if (!digest.every((b, i) => b === actual[i])) return null;
	return message;
}

function caReferenceString(data: Uint8Array): string {
	const unBcd = (byte: number) => (byte >> 4) * 10 + (byte & 0x0f);
	return [
		ascii(data.subarray(0, 2)),
		ascii(data.subarray(2, 5)),
		(data[5] & 0xf0) >> 4,
		data[5] & 0x0f,
		data[6],
		2000 + unBcd(data[7])
	].join('/');
}

interface CertKey {
	name: string;
	modulusHex: string;
	exponentHex: string;
}

/** Pull the issuer public key out of a CV certificate's recovered content. */
function certificateKey(content: Uint8Array): CertKey {
	const profile = content[0];
	const modulusLen = MODULUS_LEN[profile];
	if (!modulusLen) throw new Error(`unknown certificate profile ${profile}`);
	// The signature algorithm OID sits at offset 32 with a variable length;
	// walk to its end, then the modulus and exponent follow.
	let offset = 32;
	for (;;) {
		if (offset >= content.length) throw new Error('malformed certificate content');
		const b = content[offset++];
		if (b & 0x80) continue;
		const remaining = content.length - offset;
		if (remaining - modulusLen >= 1 && remaining - modulusLen <= 4) break;
	}
	return {
		name: ascii(content.subarray(21, 27)),
		modulusHex: hex(content.subarray(offset, offset + modulusLen)),
		exponentHex: hex(content.subarray(offset + modulusLen)) || '03'
	};
}

/** VDV compact date-time (4 bytes) as an ISO local string (Europe/Berlin). */
function vdvDateTime(d: Uint8Array): string | null {
	if (d.every((b) => b === 0)) return null;
	const year = (d[0] >> 1) + 1990;
	const month = ((d[0] & 0x01) << 3) | ((d[1] & 0xe0) >> 5);
	const day = d[1] & 0x1f;
	const hour = (d[2] & 0xf8) >> 3;
	const minute = ((d[2] & 0x07) << 3) | ((d[3] & 0xe0) >> 5);
	const second = (d[3] & 0x1f) * 2;
	// hour can exceed 23 to mean "next day"
	const extraDays = Math.floor(hour / 24);
	const date = new Date(Date.UTC(year, month - 1, day + extraDays));
	return `${isoDate(date)}T${pad(hour % 24)}:${pad(minute)}:${pad(second)}`;
}

function versionNumber(d: Uint8Array): string {
	const major = d[0] >> 4;
	let minor = d[0] & 0x0f;
	let revision: number;
	if (minor === 1) {
		minor = 10 + (d[1] >> 4);
		revision = d[1] & 0x0f;
	} else {
		revision = (d[1] >> 4) * 10 + (d[1] & 0x0f);
	}
	return `${major}.${minor}.${revision}`;
}

const int = (d: Uint8Array, start: number, end: number) => {
	let v = 0;
	for (let i = start; i < end; i++) v = v * 256 + d[i];
	return v;
};

const PRODUCT_ELEMENT_NAMES: Record<number, string> = {
	0xda: 'Basic data',
	0xdb: 'Passenger data',
	0xdc: 'Spatial validity',
	0xdd: 'Efm product',
	0xde: 'Private data',
	0xd6: 'Secure element ID',
	0xd7: 'Identification medium'
};

const GENDERS: Record<number, string> = { 1: 'male', 2: 'female', 3: 'diverse' };

export interface VdvPassenger {
	gender: string | null;
	dateOfBirth: string | null;
	forename: string;
	surname: string;
	/**
	 * True when the name is stored abbreviated. The format deliberately keeps
	 * only the first and last letter of each part plus a count of the hidden
	 * ones, so the barcode does not carry the full name.
	 */
	abbreviated: boolean;
}

const unBcd = (byte: number) => (byte >> 4) * 10 + (byte & 0x0f);

/** Expand "E3a" into "E___a": first letter, hidden count, last letter. */
function expandAbbreviated(part: string): string {
	const pattern = /(\p{L}?)(\d+)(\p{L}?)/gu;
	const pieces: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(part)) !== null) {
		const [, start, count, end] = match;
		// zero means "any number of letters"
		const hidden = Number(count) === 0 ? '…' : '_'.repeat(Number(count));
		pieces.push(`${start}${hidden}${end}`);
	}
	return pieces.length ? pieces.join(' ') : part;
}

function parsePassengerData(d: Uint8Array): VdvPassenger | null {
	if (d.length < 5) return null;
	// A year like 2000 is BCD "20 00", so a zero byte is legitimate; only an
	// entirely empty field means the date is absent.
	const dob = d.subarray(1, 5);
	const year = unBcd(dob[0]) * 100 + unBcd(dob[1]);
	const month = unBcd(dob[2]);
	const day = unBcd(dob[3]);
	const dateOfBirth =
		dob.some((b) => b !== 0) && month >= 1 && month <= 12 && day >= 1 && day <= 31
			? `${year}-${pad(month)}-${pad(day)}`
			: null;

	const text = new TextDecoder('iso-8859-15').decode(d.subarray(5)).replace(/\0+$/, '');
	let forename = '';
	let surname = text;
	let abbreviated = false;

	if (text.includes('#')) {
		// plain, simply truncated
		[forename, surname] = text.split('#', 2);
	} else if (text.includes('@')) {
		abbreviated = true;
		const [rawForename, rawSurname] = text.split('@', 2);
		forename = expandAbbreviated(rawForename.replace(/\*$/, ''));
		surname = expandAbbreviated(rawSurname.replace(/^\*/, ''));
	}

	return {
		gender: GENDERS[d[0]] ?? null,
		dateOfBirth,
		forename: forename.trim(),
		surname: surname.trim(),
		abbreviated
	};
}

const PAYMENT_TYPES: Record<number, string> = {
	1: 'Bar',
	2: 'Kreditkarte',
	3: 'POB/PEB',
	6: 'EC-Karte / Lastschrift',
	7: 'Rechnung',
	8: 'Werteinheiten'
};

const SERVICE_CLASSES: Record<number, string> = { 1: '1. Klasse', 2: '2. Klasse', 3: '1. Klasse (Zuschlag)' };

function parseBasicData(d: Uint8Array): Record<string, unknown> {
	const vat = int(d, 11, 13);
	const priceBase = int(d, 8, 11);
	return {
		paymentType: PAYMENT_TYPES[d[0]] ?? (d[0] || null),
		passengerType: d[1],
		transportCategory: d[6],
		serviceClass: SERVICE_CLASSES[d[7]] ?? d[7],
		priceBase: priceBase ? (priceBase / 100).toFixed(2) : null,
		vatRate: vat >= 100 ? vat / 100 : vat,
		priceLevel: d[13],
		internalProductNumber: int(d, 14, 17)
	};
}

/** ASCII text, or null when the bytes are not printable. */
function asAsciiText(data: Uint8Array): string | null {
	return data.length && isPrintableAscii(data) ? ascii(data) : null;
}

function parseProductData(
	data: Uint8Array,
	{ container }: { container: 'plain' | 'motics' }
): VdvProductDataElement[] {
	let items;
	try {
		items = parseTlv(data);
	} catch {
		return [{ tag: 0, name: 'Unparsed', data: null, hex: hex(data) }];
	}
	return items
		.filter((i) => i.value.some((b) => b !== 0))
		.map((i) => ({
			tag: i.tag,
			name: PRODUCT_ELEMENT_NAMES[i.tag] ?? `Element 0x${i.tag.toString(16)}`,
			data: i.tag === 0xda && i.value.length >= 17 ? parseBasicData(i.value) : null,
			passenger: i.tag === 0xdb ? (parsePassengerData(i.value) ?? undefined) : undefined,
			text:
				i.tag === 0xd7 && container === 'motics' ? (asAsciiText(i.value) ?? undefined) : undefined,
			hex: hex(i.value)
		}));
}

function parseTicket(data: Uint8Array, container: 'plain' | 'motics'): VdvTicket {
	if (data.length < 111) throw new Error(`VDV ticket too short (${data.length} bytes)`);
	const trailer = data.subarray(data.length - 5);
	if (ascii(trailer.subarray(0, 3)) !== 'VDV') {
		throw new Error('missing VDV trailer');
	}

	const header = data.subarray(0, 18);
	let rest = data.subarray(18);

	const product = parseFirstTlv(rest);
	if (product.item.tag !== 0x85) throw new Error('missing VDV product data');
	rest = rest.subarray(product.end);

	const commonTransaction = rest.subarray(0, 17);
	rest = rest.subarray(17);

	const productTransaction = parseFirstTlv(rest);
	if (productTransaction.item.tag !== 0x8a) {
		throw new Error('missing VDV product transaction data');
	}
	rest = rest.subarray(productTransaction.end);

	const issueData = rest.subarray(0, 12);

	return {
		version: versionNumber(trailer.subarray(3, 5)),
		ticketId: int(header, 0, 4),
		ticketOrgId: int(header, 4, 6),
		productNumber: int(header, 6, 8),
		productOrgId: int(header, 8, 10),
		validityStart: vdvDateTime(header.subarray(10, 14)) ?? '',
		validityEnd: vdvDateTime(header.subarray(14, 18)) ?? '',
		kvpOrgId: int(commonTransaction, 0, 2),
		terminalType: commonTransaction[2],
		terminalNumber: int(commonTransaction, 3, 5),
		terminalOwnerId: int(commonTransaction, 5, 7),
		transactionTime: vdvDateTime(commonTransaction.subarray(7, 11)),
		locationType: commonTransaction[11],
		locationNumber: int(commonTransaction, 12, 15),
		locationOrgId: int(commonTransaction, 15, 17),
		samId: int(issueData, 9, 12),
		samVersion: issueData[4],
		productData: parseProductData(product.item.value, { container })
	};
}

interface Authorization {
	signature: Uint8Array;
	remainder: Uint8Array;
}

function readAuthorizations(tags: Map<number, Uint8Array>, raw: Uint8Array): Authorization[] {
	const multi = tags.get(TAG_MULTIPLE_AUTHORIZATIONS);
	if (multi) {
		const items = parseTlv(multi);
		if (!items.length || items[0].tag !== TAG_NUMBER_AUTHORIZATIONS) {
			throw new Error('missing VDV authorization count');
		}
		const count = items[0].value[0];
		const out: Authorization[] = [];
		for (let i = 0; i < count * 2; i += 2) {
			const sig = items[i + 1];
			const rem = items[i + 2];
			if (!sig || sig.tag !== TAG_SIGNATURE || !rem || rem.tag !== TAG_REMAINDER) {
				throw new Error('malformed VDV authorization list');
			}
			out.push({ signature: sig.value, remainder: rem.value });
		}
		return out;
	}
	const sig = tags.get(TAG_SIGNATURE);
	const rem = tags.get(TAG_REMAINDER);
	if (!sig || !rem) throw new Error('missing VDV signature');
	void raw;
	return [{ signature: sig, remainder: rem }];
}

export function isVdv(data: Uint8Array): boolean {
	try {
		const items = parseTlv(data);
		if (!items.length) return false;
		const tags = new Set(items.map((i) => i.tag));
		if (tags.has(TAG_SIGNATURE) && tags.has(TAG_CERTIFICATE)) return true;
		if (tags.has(TAG_MULTIPLE_AUTHORIZATIONS) && tags.has(TAG_CERTIFICATE)) return true;
		if (tags.has(TAG_COPY_PROTECTION)) return true;
		if (tags.has(TAG_GD_IDENTIFIER) && tags.has(TAG_GD_APP_DATA)) return true;
		return false;
	} catch {
		return false;
	}
}

export function parseVdv(data: Uint8Array, caKeys_: VdvCaKeyStore = CA_KEYS): VdvBarcode {
	let tags = tlvMap(data);
	let container: 'plain' | 'motics' = 'plain';
	let containerIdentifier: string | undefined;

	// MOTICS copy-protection containers hold the VDV envelope inside
	const copyProtection = tags.get(TAG_COPY_PROTECTION);
	if (copyProtection) {
		container = 'motics';
		const inner = tlvMap(copyProtection);
		const app = inner.get(TAG_MOTICS_APP_DATA);
		if (!app) throw new Error('MOTICS container without application data');
		tags = tlvMap(app);
	} else if (tags.has(TAG_GD_APP_DATA) && tags.has(TAG_GD_IDENTIFIER)) {
		container = 'motics';
		containerIdentifier = new TextDecoder().decode(tags.get(TAG_GD_IDENTIFIER)!);
		tags = tlvMap(tags.get(TAG_GD_APP_DATA)!);
	}

	const carBytes = tags.get(TAG_CA_REFERENCE);
	const caReference = carBytes && carBytes.length === 8 ? caReferenceString(carBytes) : null;
	const base: VdvBarcode = {
		container,
		containerIdentifier,
		caReference,
		certificateHolder: null,
		recovered: false,
		tickets: []
	};

	const certRaw = tags.get(TAG_CERTIFICATE);
	if (!certRaw) return { ...base, error: 'no CV certificate in barcode' };

	const certTags = tlvMap(certRaw);
	let content = certTags.get(TAG_CERT_CONTENT);
	if (!content) {
		const certSig = certTags.get(TAG_CERT_SIGNATURE);
		const certRem = certTags.get(TAG_CERT_REMAINDER);
		if (!certSig || !certRem) return { ...base, error: 'incomplete CV certificate' };
		const caKey = caReference ? caKeys_[caReference] : undefined;
		if (!caKey) {
			return { ...base, error: `no published CA key for ${caReference ?? 'unknown CA'}` };
		}
		const recoveredContent = recover(certSig, certRem, caKey.modulus_hex, caKey.exponent_hex);
		if (!recoveredContent) return { ...base, error: 'CV certificate recovery failed' };
		content = recoveredContent;
	}

	let issuerKey: CertKey;
	try {
		issuerKey = certificateKey(content);
	} catch (e) {
		return { ...base, error: e instanceof Error ? e.message : String(e) };
	}
	base.certificateHolder = issuerKey.name;

	let authorizations: Authorization[];
	try {
		authorizations = readAuthorizations(tags, data);
	} catch (e) {
		return { ...base, error: e instanceof Error ? e.message : String(e) };
	}

	const tickets: VdvTicket[] = [];
	let payloadHex: string | undefined;
	for (const auth of authorizations) {
		const message = recover(auth.signature, auth.remainder, issuerKey.modulusHex, issuerKey.exponentHex);
		if (!message) return { ...base, error: 'ticket signature recovery failed' };
		payloadHex ??= hex(message);
		try {
			tickets.push(parseTicket(message, container));
		} catch (e) {
			return {
				...base,
				recovered: true,
				payloadHex,
				error: e instanceof Error ? e.message : String(e)
			};
		}
	}

	return { ...base, recovered: true, tickets, payloadHex };
}
