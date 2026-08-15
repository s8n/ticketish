// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A synthetic BoB ticket: a CBOR encoder for the subset the format uses, and a
 * builder that assembles the two signature layers around invented claims.
 *
 * The signatures are random bytes of the right lengths. Nothing here verifies
 * them and neither does the parser, so a real key would buy the tests nothing;
 * what matters is that the layers are the right shape and that the parser
 * never has to look inside them.
 */
import { zlibSync } from 'fflate';

// ---------------------------------------------------------------- CBOR -----

type Encodable =
	| number
	| string
	| Uint8Array
	| boolean
	| null
	| Encodable[]
	| { [key: string]: Encodable };

const concat = (parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

/** A head byte and its argument, in the shortest form that holds the value. */
function head(major: number, value: number): Uint8Array {
	const tag = major << 5;
	if (value < 24) return new Uint8Array([tag | value]);
	if (value < 0x100) return new Uint8Array([tag | 24, value]);
	if (value < 0x10000) return new Uint8Array([tag | 25, value >> 8, value & 0xff]);
	const four = [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
	return new Uint8Array([tag | 26, ...four]);
}

export function encodeCbor(value: Encodable): Uint8Array {
	if (value === null) return new Uint8Array([0xf6]);
	if (typeof value === 'boolean') return new Uint8Array([value ? 0xf5 : 0xf4]);
	if (typeof value === 'number') {
		if (value < 0) return head(1, -1 - value);
		return head(0, value);
	}
	if (typeof value === 'string') {
		const bytes = new TextEncoder().encode(value);
		return concat([head(3, bytes.length), bytes]);
	}
	if (value instanceof Uint8Array) return concat([head(2, value.length), value]);
	if (Array.isArray(value)) return concat([head(4, value.length), ...value.map(encodeCbor)]);
	const entries = Object.entries(value);
	const pairs = entries.flatMap(([k, v]) => [encodeCbor(k), encodeCbor(v)]);
	return concat([head(5, entries.length), ...pairs]);
}

// ------------------------------------------------------------- builder -----

/** Bytes that stand in for a signature, deterministic so tests can compare. */
const filler = (length: number, seed: number) =>
	new Uint8Array(Array.from({ length }, (_, i) => (seed + i * 31) & 0xff));

export interface BobParts {
	containerVersion?: string;
	/** The device signature header, the layer that rotates in the wild. */
	device?: Record<string, string>;
	/** The issuer signature header. */
	issuer?: Record<string, string>;
	/** Participant id the claims are written under. */
	participantId?: string;
	/** One entry per ticket in the barcode. */
	claims?: Encodable[];
	/** Skip compression, to check the detector rejects bare CBOR. */
	raw?: boolean;
}

/** A claim set in the shape the issuer signs, with everything invented. */
export function bobClaim(
	over: { ticketId?: string; condition?: string; passengers?: [string, string][] } = {}
): Encodable {
	const metadata: Encodable[] = [{ tid: over.ticketId ?? 'TEST001' }];
	const passengers = over.passengers ?? [['adult', '1']];
	metadata.push({ tpc: passengers.map(([cat, tra]) => ({ cat, tra })) });
	return {
		c_vn: '1',
		c_vm: '1',
		c_vt: '1',
		c_md: metadata,
		c_tc: over.condition ?? '99:@20300101T0800Z/20300102T0800Z & #test_zone'
	};
}

export function buildBob(parts: BobParts = {}): Uint8Array {
	const participantId = parts.participantId ?? '99';
	const claimBytes = encodeCbor({ [participantId]: parts.claims ?? [bobClaim()] });

	const issuerHeader = encodeCbor({
		alg: 'ES256',
		iid: participantId,
		kid: 'TestKeyId1',
		miv: '4',
		exp: '20300401T000000Z',
		dsp: participantId,
		dsi: 'VEVTVERFVklDRQ',
		...parts.issuer
	});
	// ES256 is r and s, thirty-two bytes each
	const issuerLayer = encodeCbor([issuerHeader, claimBytes, filler(64, 7)]);

	const deviceHeader = encodeCbor({
		alg: 'HS256-128',
		did: 'VEVTVERFVklDRQ',
		kid: 'TestKeyId2',
		t: '20300101T090000Z',
		app: participantId,
		...parts.device
	});
	// HS256-128 is SHA-256 truncated to its first sixteen bytes
	const outer = encodeCbor([deviceHeader, issuerLayer, filler(16, 3)]);

	const container = encodeCbor({
		v: new TextEncoder().encode(parts.containerVersion ?? 'a1'),
		p: outer
	});
	return parts.raw ? container : zlibSync(container);
}
