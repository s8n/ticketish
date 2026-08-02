/**
 * UK RSP6 barcodes ("06" tickets / "08" railcards).
 *
 * The barcode is ASCII: type + ticket reference + issuer, followed by a
 * base26-encoded RSA signature with message recovery: raising it to the
 * issuer's public exponent recovers the padded payload, whose last 8 bytes
 * are a SHA-256 integrity check. Public keys are published by RSP; the copy
 * here is vendored from eta's rsp6-decoder (MIT).
 *
 * Bit layouts ported from zuegli's main/rsp/data.py (EUPL-1.2).
 */
import keysJson from './keys.json' with { type: 'json' };
import { sha256 } from './sha256.ts';

interface RspKey {
	issuer_id: string;
	modulus_hex: string;
	public_exponent_hex: string;
}

const KEYS = keysJson as unknown as Record<string, RspKey[]>;

export interface Rsp6Reservation {
	serviceId: string;
	coach: string;
	seat: string;
}

export interface Rsp6PurchaseData {
	purchaseDate: string;
	pricePence: number;
	discounted: boolean;
	restriction: string;
	purchaseReference: string;
	daysOfValidity: number;
	additionalAdults: number;
	additionalChildren: number;
}

export interface Rsp6TicketData {
	kind: 'ticket';
	mandatoryManualCheck: boolean;
	nonRevenue: boolean;
	specVersion: number;
	ticketReference: string;
	standardClass: boolean;
	lennonTicketType: string;
	fareLabel: string;
	originNlc: string;
	destinationNlc: string;
	sellingNlc: string;
	childTicket: boolean;
	couponType: 'single' | 'season' | 'outbound' | 'inbound';
	discountCode: number;
	routeCode: number;
	startDate: string; // YYYY-MM-DDTHH:MM local (Europe/London)
	departTimeFlag: 'notSet' | 'validAfter' | 'specificDeparture' | 'suggestedDeparture';
	passengerId: number;
	restrictionCode: string;
	viaLondon: boolean;
	bidirectional: boolean;
	carnetCount: number;
	purchase: Rsp6PurchaseData | null;
	reservations: Rsp6Reservation[];
	freeUse: string;
}

export interface Rsp6RailcardData {
	kind: 'railcard';
	specVersion: number;
	issuerId: string;
	ticketReference: string;
	startDate: string;
	endDate: string;
	passenger1: string;
	passenger2: string | null;
	purchaseDate: string;
	railcardType: string;
	railcardTypeName: string;
	railcardNumber: string;
	sellingNlc: string;
	freeUse: string;
}

export interface Rsp6Ticket {
	ticketType: '06' | '08';
	ticketRef: string;
	issuerId: string;
	keyRecovered: boolean;
	error?: string;
	data: Rsp6TicketData | Rsp6RailcardData | null;
	payloadHex?: string;
}

export function isRsp6(data: Uint8Array): boolean {
	if (data.length < 20) return false;
	const s = asciiOrNull(data);
	if (!s) return false;
	if (!s.startsWith('06') && !s.startsWith('08')) return false;
	return /^[A-Z0-9]{15}[A-Z]+$/.test(s);
}

function asciiOrNull(data: Uint8Array): string | null {
	let s = '';
	for (const b of data) {
		if (b < 0x20 || b > 0x7e) return null;
		s += String.fromCharCode(b);
	}
	return s;
}

/** eta-style base26: digits read back to front, then the bytes reversed. */
function base26ToBigInt(s: string): bigint {
	let num = 0n;
	for (let i = s.length - 1; i >= 0; i--) {
		num = num * 26n + BigInt(s.charCodeAt(i) - 65);
	}
	const bytes = bigIntToBytes(num);
	bytes.reverse();
	return bytesToBigInt(bytes);
}

function bigIntToBytes(n: bigint): Uint8Array {
	let hex = n.toString(16);
	if (hex.length % 2) hex = '0' + hex;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function bytesToBigInt(b: Uint8Array): bigint {
	let n = 0n;
	for (const x of b) n = n * 256n + BigInt(x);
	return n;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
	let result = 1n;
	base %= mod;
	while (exp > 0n) {
		if (exp & 1n) result = (result * base) % mod;
		base = (base * base) % mod;
		exp >>= 1n;
	}
	return result;
}

/** Recover the signed message; returns null if padding or hash don't check out. */
function recoverPayload(b26: string, issuerId: string): Uint8Array | null {
	const keys = KEYS[issuerId];
	if (!keys) return null;
	const num = base26ToBigInt(b26);
	for (const key of keys) {
		const recovered = modPow(num, BigInt('0x' + key.public_exponent_hex), BigInt('0x' + key.modulus_hex));
		const rb = bigIntToBytes(recovered);
		let data: Uint8Array;
		if (rb[0] === 1) {
			let off = 1;
			while (off < rb.length && rb[off] === 0xff) off++;
			if (rb[off] !== 0) continue;
			data = rb.subarray(off + 1);
		} else if (rb[0] === 2) {
			let off = 1;
			while (off < rb.length && rb[off] !== 0) off++;
			data = rb.subarray(off + 1);
		} else {
			continue;
		}
		const body = data.subarray(0, data.length - 8);
		const hash = data.subarray(data.length - 8);
		const digest = sha256(body).subarray(0, 8);
		if (digest.every((x, i) => x === hash[i])) return body;
	}
	return null;
}

/** Bit-addressed reads over the recovered payload. */
class Bits {
	constructor(private d: Uint8Array) {}
	bit(i: number): number {
		return (this.d[i >> 3] >> (7 - (i & 7))) & 1;
	}
	bool(i: number): boolean {
		return this.bit(i) === 1;
	}
	int(start: number, end: number): number {
		let v = 0;
		for (let i = start; i < end; i++) v = v * 2 + this.bit(i);
		return v;
	}
	/** 6-bit chars offset by 0x20 */
	str(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += String.fromCharCode(this.int(i, i + 6) + 0x20);
		return s.trim();
	}
	date(start: number, end: number): string {
		// days since 1997-01-01
		const d = new Date(Date.UTC(1997, 0, 1));
		d.setUTCDate(d.getUTCDate() + this.int(start, end));
		return d.toISOString().slice(0, 10);
	}
	time(start: number, end: number): string {
		const v = this.int(start, end);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${p(Math.floor(v / 60) % 24)}:${p(v % 60)}`;
	}
}

const COUPON_TYPES = ['single', 'season', 'outbound', 'inbound'] as const;
const DEPART_FLAGS = ['notSet', 'validAfter', 'specificDeparture', 'suggestedDeparture'] as const;

const RAILCARD_NAMES: Record<string, string> = {
	TSU: '16-17 Saver',
	YNG: '16-25 Railcard',
	TST: '26-30 Railcard',
	SRN: 'Senior Railcard',
	FAM: 'Family & Friends Railcard',
	DIS: 'Disabled Persons Railcard',
	HMF: 'HM Forces Railcard',
	VET: 'Veterans Railcard',
	NEW: 'Network Railcard',
	NGC: 'Gold Card',
	'2TR': 'Two Together Railcard',
	JCP: 'Jobcentre Plus Travel Discount Card',
	PRV: 'Staff Travel Card'
};

function parseTicketData(payload: Uint8Array): Rsp6TicketData {
	if (payload.length < 108) throw new Error(`RSP6 payload too short (${payload.length} bytes)`);
	const d = new Bits(payload);
	const hasOptional = d.bool(384);
	const numReservations = d.int(386, 390);

	let offset = 390;
	let purchase: Rsp6PurchaseData | null = null;
	if (hasOptional) {
		purchase = {
			purchaseDate: `${d.date(offset, offset + 14)}T${d.time(offset + 14, offset + 25)}`,
			pricePence: d.int(offset + 25, offset + 46),
			discounted: d.bool(offset + 46),
			restriction: d.str(offset + 47, offset + 59),
			purchaseReference: d.str(offset + 59, offset + 107),
			daysOfValidity: d.int(offset + 107, offset + 116),
			additionalAdults: d.int(offset + 116, offset + 119),
			additionalChildren: d.int(offset + 119, offset + 122)
		};
		offset += 122;
	}

	const reservations: Rsp6Reservation[] = [];
	for (let i = 0; i < numReservations; i++) {
		const seatLetters = d.str(offset + 32, offset + 38);
		const seatNum = d.int(offset + 38, offset + 45);
		reservations.push({
			serviceId: `${d.str(offset, offset + 12)}${d.int(offset + 12, offset + 26)}`,
			coach: d.str(offset + 26, offset + 32),
			seat: seatNum ? `${seatNum}${seatLetters}` : ''
		});
		offset += 45;
		if (offset + 45 >= 692) break;
	}

	return {
		kind: 'ticket',
		mandatoryManualCheck: d.bool(0),
		nonRevenue: d.bool(5),
		specVersion: d.int(6, 8),
		ticketReference: d.str(8, 62),
		standardClass: d.bool(72),
		lennonTicketType: d.str(73, 91),
		fareLabel: d.str(91, 109),
		originNlc: d.str(109, 133).replace(/^[ 0]+/, ''),
		destinationNlc: d.str(133, 157).replace(/^[ 0]+/, ''),
		sellingNlc: d.str(157, 181).replace(/^[ 0]+/, ''),
		childTicket: d.bool(181),
		couponType: COUPON_TYPES[d.int(182, 184)],
		discountCode: d.int(184, 194),
		routeCode: d.int(194, 211),
		startDate: `${d.date(211, 225)}T${d.time(225, 236)}`,
		departTimeFlag: DEPART_FLAGS[d.int(236, 238)],
		passengerId: d.int(238, 255),
		restrictionCode: d.str(329, 347),
		viaLondon: d.bool(347),
		bidirectional: d.bool(372),
		carnetCount: d.int(373, 379),
		purchase,
		reservations,
		freeUse: d.str(offset, offset + 172)
	};
}

function parseRailcardData(payload: Uint8Array): Rsp6RailcardData {
	if (payload.length < 108) throw new Error(`RSP6 payload too short (${payload.length} bytes)`);
	const d = new Bits(payload);
	const fullName = (title: string, forename: string, surname: string) =>
		[title, forename, surname].filter(Boolean).join(' ').trim();
	const p1 = fullName(d.str(108, 132), d.str(132, 222), d.str(222, 312));
	const p2 = fullName(d.str(312, 336), d.str(336, 426), d.str(426, 516));
	const railcardType = d.str(566, 584);
	return {
		kind: 'railcard',
		specVersion: d.int(2, 4),
		issuerId: d.str(4, 16),
		ticketReference: d.str(16, 70),
		startDate: d.date(80, 94),
		endDate: d.date(94, 108),
		passenger1: p1,
		passenger2: p2 || null,
		purchaseDate: `${d.date(516, 530)}T${d.time(530, 541)}`,
		railcardType,
		railcardTypeName: RAILCARD_NAMES[railcardType] ?? railcardType,
		railcardNumber: d.str(584, 680),
		sellingNlc: d.str(687, 711).replace(/^[ 0]+/, ''),
		freeUse: d.str(744, 864)
	};
}

export function parseRsp6(data: Uint8Array): Rsp6Ticket {
	const s = asciiOrNull(data);
	if (!s || !isRsp6(data)) throw new Error('not an RSP6 barcode');
	const ticketType = s.slice(0, 2) as '06' | '08';
	const base = {
		ticketType,
		ticketRef: s.slice(2, 11),
		issuerId: s.slice(13, 15)
	};

	const payload = recoverPayload(s.slice(15), base.issuerId);
	if (!payload) {
		return {
			...base,
			keyRecovered: false,
			error: KEYS[base.issuerId]
				? 'signature recovery failed with all known keys for this issuer'
				: `no published key for issuer ${base.issuerId}`,
			data: null
		};
	}

	try {
		const parsed = ticketType === '08' ? parseRailcardData(payload) : parseTicketData(payload);
		return { ...base, keyRecovered: true, data: parsed, payloadHex: hex(payload) };
	} catch (e) {
		return {
			...base,
			keyRecovered: true,
			error: e instanceof Error ? e.message : String(e),
			data: null,
			payloadHex: hex(payload)
		};
	}
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
