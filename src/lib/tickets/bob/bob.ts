// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * BoB tickets, the Swedish national ticket standard.
 *
 * BoB (Biljetter och Betalning) is Samtrafiken's standard for issuing and
 * validating tickets across the Swedish public transport authorities, so this
 * is not one operator's format: Skånetrafiken, Västtrafik, SL and the rest all
 * issue through it, and which of them a ticket came from is a participant id
 * inside it rather than anything about its shape.
 *
 * The barcode is an Aztec symbol holding zlib compressed CBOR:
 *
 *   {"v": h'6131', "p": <bytes>}          the container, v is the ASCII "a1"
 *     p -> [protected, payload, signature]   the device signature
 *       protected: {alg, did, kid, t, app}
 *       payload -> [protected, payload, signature]   the issuer signature
 *         protected: {alg, iid, kid, miv, exp, dsp, dsi}
 *         payload:   {"<iid>": [ {c_vn, c_vm, c_vt, c_md, c_tc}, … ]}
 *
 * Both layers are JWS (RFC 7515) adapted to CBOR, which is why each nested
 * structure is carried as a byte string: the signature covers the encoded
 * bytes, so they have to survive decoding unchanged.
 *
 * The two layers do different jobs, and the outer one is the reason a BoB
 * ticket cannot be treated as a static payload. The issuer signs the ticket
 * once with ES256 and that signature lasts until `exp`, a month or so out. The
 * app then re-signs the whole thing every few seconds with a truncated HMAC
 * (the "HS256-128" the header names), stamping the moment into `t`. An
 * inspector's reader checks that stamp is recent, so a screenshot of the
 * barcode stops validating almost immediately even though the ticket inside it
 * is still perfectly good. Three photographs of one ticket taken seconds apart
 * differ in `t` and in the outer signature, and are byte identical from the
 * issuer signature inwards.
 *
 * Nothing here verifies either signature. The keys live in Samtrafiken's
 * participant registry, which is not public and would be a network round trip
 * besides, and verification is out of scope in this repo anyway.
 *
 * Written from the BoB documentation's description of the electronic ticket
 * and the travel condition syntax, not ported from any implementation.
 */
import { unzlibSync } from 'fflate';
import { decodeCbor, isCborMap, cborBytes, cborText, type CborValue } from './cbor.ts';

/** The container version, as the ASCII in the outer map's "v". */
const CONTAINER_VERSION = 'a1';

/**
 * A BoB barcode is a few hundred bytes. The cap is what keeps a payload that
 * merely starts like zlib from being inflated at length before being rejected.
 */
const MAX_COMPRESSED = 8192;
const MIN_COMPRESSED = 32;

/** The device signature, which is the layer that rotates. */
export interface BobDeviceSignature {
	/** "HS256-128", a SHA-256 HMAC truncated to its first 128 bits. */
	algorithm: string | null;
	/** The device the ticket is installed on, as the issuer numbered it. */
	deviceId: string | null;
	keyId: string | null;
	/** When this signature was made, which is seconds ago on a live screen. */
	signedAt: string | null;
	/** The issuing app, by participant id. */
	appId: string | null;
	signature: string;
}

/** The issuer's signature over the ticket itself. */
export interface BobIssuerSignature {
	/** "ES256" on everything seen; the registry holds the P-256 public keys. */
	algorithm: string | null;
	/** Participant id of whoever issued the ticket. */
	issuerId: string | null;
	keyId: string | null;
	/** When the issuer signature stops being accepted. */
	expires: string | null;
	/** Participant id of whoever provides the device signature above. */
	deviceSignatureProvider: string | null;
	/** The device id the device signature is expected to carry. */
	deviceSignatureId: string | null;
	/** Undocumented here, carried through as it appears. */
	miv: string | null;
	signature: string;
}

export interface BobPassengers {
	/** A fare category such as "reg", named per participant. */
	category: string | null;
	/** How many travellers the category covers. */
	count: string | null;
}

/**
 * What a travel condition says, as far as it is safe to read.
 *
 * The condition is a boolean expression in BoB's compact syntax, with named
 * conditions, participant scoped properties, and parentheses: the
 * documentation's own example reads
 * `42 : @P7M/20160618T0000 & 42:zone:[1,5,7] & (! #peakHours | #holidays)`.
 * Only the parts that stand alone whatever the rest of the expression does are
 * pulled out, which means an interval that is not under a negation and the
 * names that appear. The raw string is always kept, because it is the only
 * complete statement of what the ticket is good for.
 */
export interface BobTravelCondition {
	raw: string;
	/** Start of the validity interval, when one is given as a timestamp. */
	validFrom: string | null;
	/** End of it. An interval may instead give a duration, left in `raw`. */
	validUntil: string | null;
	/** The `#name` conditions, which name a product, zone or restriction. */
	names: string[];
}

/** One ticket's claims, as the issuer signed them. */
export interface BobClaim {
	/** The participant whose namespace these claims are written in. */
	participantId: string;
	/** The ticket's own identifier. */
	ticketId: string | null;
	passengers: BobPassengers[];
	condition: BobTravelCondition | null;
	/**
	 * Which versions of the participant's definition files the claims were
	 * written against, by the c_v* keys that carry them.
	 */
	definitionVersions: Record<string, string>;
	/** Claim keys with no mapping here, so nothing signed is hidden. */
	other: Record<string, unknown>;
}

export interface BobTicket {
	/** The container version string, "a1" so far. */
	containerVersion: string;
	device: BobDeviceSignature;
	issuer: BobIssuerSignature;
	claims: BobClaim[];
}

const shortHex = (b: Uint8Array) =>
	[...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * BoB writes timestamps in ISO 8601's basic form, `20260815T133346Z`, which
 * nothing else in the app displays. Widening it to the extended form is what
 * the rest of the formatting expects, and a string that is not a timestamp is
 * returned untouched rather than mangled into one.
 */
function expandTimestamp(value: string | null): string | null {
	if (!value) return null;
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
	if (!m) return value;
	const [, y, mo, d, h, mi, s, zone] = m;
	return `${y}-${mo}-${d}T${h}:${mi}${s ? `:${s}` : ''}${zone ?? ''}`;
}

/** A JWS layer: the three byte strings a CBOR signature array holds. */
function signatureLayer(value: CborValue): [CborValue, Uint8Array, Uint8Array] {
	if (!Array.isArray(value) || value.length !== 3) throw new Error('not a BoB signature array');
	const [protectedHeader, payload, signature] = value;
	if (!(protectedHeader instanceof Uint8Array)) throw new Error('BoB header is not bytes');
	if (!(payload instanceof Uint8Array)) throw new Error('BoB payload is not bytes');
	if (!(signature instanceof Uint8Array)) throw new Error('BoB signature is not bytes');
	const header = decodeCbor(protectedHeader);
	if (!isCborMap(header)) throw new Error('BoB header is not a map');
	return [header, payload, signature];
}

/**
 * The interval and the names out of a travel condition.
 *
 * Everything here is deliberately shallow. `@` introduces an interval and `#`
 * a named condition, and both are read wherever they appear, except that a
 * condition holding a `!` is left without an interval: under a negation the
 * interval says when the ticket is *not* valid, and a validity shown the wrong
 * way round is worse than one not shown at all. Anything else the syntax can
 * express, the participant scoped properties and the grouping, is left in the
 * raw string.
 */
function parseTravelCondition(raw: string): BobTravelCondition {
	const names = [...raw.matchAll(/#([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
	const condition: BobTravelCondition = { raw, validFrom: null, validUntil: null, names };
	if (raw.includes('!')) return condition;
	const interval = /@(\S+)\/(\S+)/.exec(raw);
	if (!interval) return condition;
	const isStamp = (s: string) => /^\d{8}T\d{4}/.test(s);
	// an endpoint may be a duration (P7M) rather than a timestamp, and a
	// duration only means something against the endpoint it is measured from
	if (isStamp(interval[1])) condition.validFrom = expandTimestamp(interval[1]);
	if (isStamp(interval[2])) condition.validUntil = expandTimestamp(interval[2]);
	return condition;
}

/** The passenger categories, from the `tpc` entry in a claim's metadata. */
function readPassengers(entries: CborValue[]): BobPassengers[] {
	const out: BobPassengers[] = [];
	for (const entry of entries) {
		if (!isCborMap(entry)) continue;
		out.push({ category: cborText(entry, 'cat'), count: cborText(entry, 'tra') });
	}
	return out;
}

/**
 * A claim set. `c_md` is a list of single entry maps rather than one map,
 * which is what lets a claim carry several of the same key, so it is walked
 * as a list and the keys that are understood are picked out of it.
 */
function readClaim(participantId: string, value: CborValue): BobClaim {
	const claim: BobClaim = {
		participantId,
		ticketId: null,
		passengers: [],
		condition: null,
		definitionVersions: {},
		other: {}
	};
	if (!isCborMap(value)) return claim;
	for (const [key, entry] of Object.entries(value)) {
		if (key === 'c_tc' && typeof entry === 'string') {
			claim.condition = parseTravelCondition(entry);
		} else if (/^c_v[a-z]$/.test(key) && typeof entry === 'string') {
			claim.definitionVersions[key] = entry;
		} else if (key === 'c_md' && Array.isArray(entry)) {
			for (const item of entry) {
				if (!isCborMap(item)) continue;
				const ticketId = cborText(item, 'tid');
				if (ticketId !== null) claim.ticketId = ticketId;
				const categories = item['tpc'];
				if (Array.isArray(categories)) claim.passengers.push(...readPassengers(categories));
				for (const [k, v] of Object.entries(item)) {
					if (k !== 'tid' && k !== 'tpc') claim.other[k] = v;
				}
			}
		} else {
			claim.other[key] = entry;
		}
	}
	return claim;
}

/** The container: zlib, then a CBOR map carrying the version and the payload. */
function unwrap(data: Uint8Array): { version: string; payload: Uint8Array } {
	if (data.length < MIN_COMPRESSED || data.length > MAX_COMPRESSED) {
		throw new Error('not a BoB ticket');
	}
	// a zlib header: deflate in the low nibble, and the two bytes a multiple of 31
	if ((data[0] & 0x0f) !== 8 || (((data[0] << 8) | data[1]) % 31) !== 0) {
		throw new Error('not a BoB ticket');
	}
	const container = decodeCbor(unzlibSync(data));
	const version = cborBytes(container, 'v');
	const payload = cborBytes(container, 'p');
	if (!version || !payload) throw new Error('not a BoB container');
	return { version: new TextDecoder().decode(version), payload };
}

export function isBob(data: Uint8Array): boolean {
	try {
		const { version, payload } = unwrap(data);
		if (version !== CONTAINER_VERSION) return false;
		// the two nested signature layers are the shape nothing else shares
		const [, inner] = signatureLayer(decodeCbor(payload));
		signatureLayer(decodeCbor(inner));
		return true;
	} catch {
		return false;
	}
}

export function parseBob(data: Uint8Array): BobTicket {
	const { version, payload } = unwrap(data);
	const [deviceHeader, issuerLayer, deviceSig] = signatureLayer(decodeCbor(payload));
	const [issuerHeader, claimBytes, issuerSig] = signatureLayer(decodeCbor(issuerLayer));

	const claims: BobClaim[] = [];
	const body = decodeCbor(claimBytes);
	if (isCborMap(body)) {
		for (const [participantId, sets] of Object.entries(body)) {
			// the claims for a participant are a list, one entry per ticket
			if (!Array.isArray(sets)) continue;
			for (const set of sets) claims.push(readClaim(participantId, set));
		}
	}

	return {
		containerVersion: version,
		device: {
			algorithm: cborText(deviceHeader, 'alg'),
			deviceId: cborText(deviceHeader, 'did'),
			keyId: cborText(deviceHeader, 'kid'),
			signedAt: expandTimestamp(cborText(deviceHeader, 't')),
			appId: cborText(deviceHeader, 'app'),
			signature: shortHex(deviceSig)
		},
		issuer: {
			algorithm: cborText(issuerHeader, 'alg'),
			issuerId: cborText(issuerHeader, 'iid'),
			keyId: cborText(issuerHeader, 'kid'),
			expires: expandTimestamp(cborText(issuerHeader, 'exp')),
			deviceSignatureProvider: cborText(issuerHeader, 'dsp'),
			deviceSignatureId: cborText(issuerHeader, 'dsi'),
			miv: cborText(issuerHeader, 'miv'),
			signature: shortHex(issuerSig)
		},
		claims
	};
}
