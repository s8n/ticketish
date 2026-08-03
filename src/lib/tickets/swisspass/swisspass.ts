// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: EUPL-1.2
// Ported from zuegli (EUPL-1.2), so it cannot also be offered under MIT.

/**
 * SwissPass / NOVA mobile tickets: the QR carries a protobuf SignedTicket.
 * Schema reverse-engineered by zuegli (main/swisspass/swisspass.proto,
 * EUPL-1.2); decoded here with a small hand-written proto3 wire reader.
 */
import orgsJson from './orgs.json' with { type: 'json' };
import { fmtZoned } from '../format.ts';

const ORGS = orgsJson as Record<string, string>;

// ---- minimal proto3 wire reader ----------------------------------------

interface WireField {
	num: number;
	wire: number;
	value: bigint | Uint8Array;
}

function readVarint(d: Uint8Array, pos: number): [bigint, number] {
	let result = 0n;
	let shift = 0n;
	for (;;) {
		if (pos >= d.length) throw new Error('truncated varint');
		const b = d[pos++];
		result |= BigInt(b & 0x7f) << shift;
		if ((b & 0x80) === 0) return [result, pos];
		shift += 7n;
		if (shift > 70n) throw new Error('varint too long');
	}
}

function readFields(d: Uint8Array): WireField[] {
	const fields: WireField[] = [];
	let pos = 0;
	while (pos < d.length) {
		const [tag, p1] = readVarint(d, pos);
		pos = p1;
		const num = Number(tag >> 3n);
		const wire = Number(tag & 7n);
		if (num === 0) throw new Error('invalid field number 0');
		if (wire === 0) {
			const [v, p] = readVarint(d, pos);
			fields.push({ num, wire, value: v });
			pos = p;
		} else if (wire === 2) {
			const [len, p] = readVarint(d, pos);
			const end = p + Number(len);
			if (end > d.length) throw new Error('truncated length-delimited field');
			fields.push({ num, wire, value: d.subarray(p, end) });
			pos = end;
		} else if (wire === 1) {
			fields.push({ num, wire, value: d.subarray(pos, pos + 8) });
			pos += 8;
		} else if (wire === 5) {
			fields.push({ num, wire, value: d.subarray(pos, pos + 4) });
			pos += 4;
		} else {
			throw new Error(`unsupported wire type ${wire}`);
		}
	}
	return fields;
}

// ---- schema-driven mapping ----------------------------------------------

type FieldSpec =
	| { name: string; type: 'string' | 'uint' | 'bool' | 'bytes'; repeated?: boolean }
	| { name: string; type: 'enum'; values: string[]; repeated?: boolean }
	| { name: string; type: 'msg'; schema: Schema; repeated?: boolean }
	| { name: string; type: 'time' };

type Schema = Record<number, FieldSpec>;

const utf8 = new TextDecoder('utf-8');

const TIME: Schema = { 1: { name: 'msecs', type: 'uint' } };

const TRAVEL_CLASS = ['unknown', 'first', 'second', 'upgrade'];
const JOURNEY_TYPE = ['unknown', 'oneWay', 'return', 'twoWay'];
const VALIDITY_TYPE = ['unknown', 'spaceAndTime', 'validation'];
const ROUTE_TYPE = ['unknown', 'undefined', 'routeTicket', 'zoneTicket'];
const LANGUAGE = ['unknown', 'DE', 'FR', 'IT', 'EN'];
const TRANSPORT_TYPE = ['unknown', 'railway', 'bus', 'tram', 'boat', 'mountainRailway'];

const TARIFF: Schema = {
	1: { name: 'product', type: 'msg', schema: { 1: { name: 'language', type: 'enum', values: LANGUAGE }, 2: { name: 'name', type: 'string' } } },
	2: { name: 'departureStation', type: 'string' },
	3: { name: 'arrivalStation', type: 'string' },
	4: { name: 'travelClass', type: 'enum', values: TRAVEL_CLASS },
	5: { name: 'journeyType', type: 'enum', values: JOURNEY_TYPE },
	6: { name: 'route', type: 'string', repeated: true },
	8: { name: 'validFrom', type: 'time' },
	9: { name: 'validUntil', type: 'time' },
	10: { name: 'returnValidFrom', type: 'time' },
	11: { name: 'returnValidUntil', type: 'time' },
	12: { name: 'productNumber', type: 'uint' },
	13: {
		name: 'zones',
		type: 'msg',
		repeated: true,
		schema: { 1: { name: 'allZones', type: 'bool' }, 2: { name: 'zoneId', type: 'uint' }, 3: { name: 'zoneOrg', type: 'uint' } }
	},
	15: { name: 'tariff', type: 'string' },
	16: { name: 'reducedTariff', type: 'bool' },
	17: { name: 'nightSurcharge', type: 'bool' },
	18: { name: 'validityType', type: 'enum', values: VALIDITY_TYPE },
	19: { name: 'routeType', type: 'enum', values: ROUTE_TYPE }
};

const TICKET: Schema = {
	1: { name: 'ticketId', type: 'uint' },
	2: { name: 'tariff', type: 'msg', schema: TARIFF },
	3: {
		name: 'traveler',
		type: 'msg',
		schema: {
			1: { name: 'customerNumber', type: 'string' },
			2: { name: 'swisspassId', type: 'string' },
			3: { name: 'surname', type: 'string' },
			4: { name: 'forename', type: 'string' },
			5: { name: 'birthday', type: 'time' },
			6: { name: 'mobileNumber', type: 'string' },
			7: { name: 'tariff', type: 'string' },
			8: { name: 'reduction', type: 'string' }
		}
	},
	5: {
		name: 'sale',
		type: 'msg',
		schema: {
			1: { name: 'sellingTime', type: 'time' },
			2: { name: 'language', type: 'enum', values: LANGUAGE },
			3: { name: 'salePoint', type: 'uint' },
			4: { name: 'issuingOrg', type: 'uint' }
		}
	},
	6: {
		name: 'payment',
		type: 'msg',
		schema: {
			1: { name: 'paymentMethod', type: 'string' },
			2: { name: 'currency', type: 'string' },
			3: { name: 'price', type: 'string' }
		}
	},
	7: {
		name: 'extra',
		type: 'msg',
		schema: {
			1: { name: 'fallback', type: 'bool' },
			2: { name: 'extra', type: 'string' },
			3: { name: 'specimen', type: 'bool' }
		}
	},
	8: {
		name: 'transport',
		type: 'msg',
		repeated: true,
		schema: {
			11: { name: 'journeyNumber', type: 'string' },
			12: { name: 'carriage', type: 'string' },
			13: { name: 'seats', type: 'string', repeated: true },
			15: { name: 'type', type: 'enum', values: TRANSPORT_TYPE }
		}
	},
	10: {
		name: 'tariffs',
		type: 'msg',
		repeated: true,
		schema: { 1: { name: 'name', type: 'string' }, 2: { name: 'passengerCount', type: 'uint' } }
	}
};

const SIGNED_TICKET: Schema = {
	1: { name: 'ticketData', type: 'msg', schema: TICKET },
	2: { name: 'metadata', type: 'msg', schema: { 1: { name: 'version', type: 'uint' } } },
	3: { name: 'key', type: 'bytes' },
	4: {
		name: 'keyMeta',
		type: 'msg',
		schema: { 1: { name: 'rics', type: 'string' }, 2: { name: 'keyId', type: 'string' } }
	},
	5: { name: 'signature', type: 'bytes' }
};

function decodeMessage(data: Uint8Array, schema: Schema): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of readFields(data)) {
		const spec = schema[f.num];
		if (!spec) continue; // unknown fields are skipped
		let value: unknown;
		switch (spec.type) {
			case 'string':
				if (!(f.value instanceof Uint8Array)) throw new Error('wire type mismatch');
				value = utf8.decode(f.value);
				break;
			case 'bytes':
				if (!(f.value instanceof Uint8Array)) throw new Error('wire type mismatch');
				value = f.value;
				break;
			case 'uint':
				if (typeof f.value !== 'bigint') throw new Error('wire type mismatch');
				value = f.value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(f.value) : f.value.toString();
				break;
			case 'bool':
				value = f.value !== 0n;
				break;
			case 'enum': {
				if (typeof f.value !== 'bigint') throw new Error('wire type mismatch');
				const i = Number(f.value);
				value = spec.values[i] ?? `unknown(${i})`;
				break;
			}
			case 'time': {
				if (!(f.value instanceof Uint8Array)) throw new Error('wire type mismatch');
				const t = decodeMessage(f.value, TIME) as { msecs?: number };
				value = t.msecs ?? null;
				break;
			}
			case 'msg':
				if (!(f.value instanceof Uint8Array)) throw new Error('wire type mismatch');
				value = decodeMessage(f.value, spec.schema);
				break;
		}
		if ('repeated' in spec && spec.repeated) {
			(out[spec.name] as unknown[] | undefined) ? (out[spec.name] as unknown[]).push(value) : (out[spec.name] = [value]);
		} else {
			out[spec.name] = value;
		}
	}
	return out;
}

// ---- public API ----------------------------------------------------------

export interface SwissPassTicket {
	ticketData: Record<string, unknown>;
	keyMeta?: { rics?: string; keyId?: string };
	metadata?: { version?: number };
}

export function parseSwissPass(data: Uint8Array): SwissPassTicket {
	const msg = decodeMessage(data, SIGNED_TICKET) as unknown as SwissPassTicket & {
		signature?: Uint8Array;
	};
	// require the essential structure, otherwise random binary data could
	// "successfully" decode as an empty message
	if (!msg.ticketData || !msg.keyMeta?.rics || !/^\d+$/.test(msg.keyMeta.rics)) {
		throw new Error('not a SwissPass ticket');
	}
	delete msg.signature;
	return msg;
}

export function isSwissPass(data: Uint8Array): boolean {
	try {
		parseSwissPass(data);
		return true;
	} catch {
		return false;
	}
}

export function novaOrgName(code: number | undefined): string | null {
	if (code === undefined) return null;
	return ORGS[String(code).padStart(3, '0')] ?? null;
}

/** Format an epoch-milliseconds timestamp in Swiss local time. */
export const fmtZurich = (msecs: number | null | undefined) =>
	msecs ? fmtZoned(msecs, 'Europe/Zurich') : null;
