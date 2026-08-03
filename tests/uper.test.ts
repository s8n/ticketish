/**
 * Validates the UPER runtime against ground truth produced by the Python
 * `asn1tools` library from the same sample barcodes (see tests/fixtures).
 * Only the published DB specimen tickets are used, never personal ones.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeUper, type AsnSchema } from '../src/lib/tickets/asn1/uper.ts';
import fcb1 from '../src/lib/tickets/asn1/schemas/fcb1.json' with { type: 'json' };
import fcb2 from '../src/lib/tickets/asn1/schemas/fcb2.json' with { type: 'json' };
import fcb3 from '../src/lib/tickets/asn1/schemas/fcb3.json' with { type: 'json' };
import header1 from '../src/lib/tickets/asn1/schemas/header1.json' with { type: 'json' };
import header2 from '../src/lib/tickets/asn1/schemas/header2.json' with { type: 'json' };

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

const FCB: Record<number, AsnSchema> = {
	1: fcb1 as AsnSchema,
	13: fcb1 as AsnSchema,
	2: fcb2 as AsnSchema,
	3: fcb3 as AsnSchema
};

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/** Convert decoder output to the JSON shape used by the ground truth files. */
function jsonable(v: unknown): unknown {
	if (v instanceof Uint8Array) {
		return { __bytes__: [...v].map((b) => b.toString(16).padStart(2, '0')).join('') };
	}
	if (Array.isArray(v)) return v.map(jsonable);
	if (v && typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if ('__choice__' in o) return { __choice__: o.__choice__, value: jsonable(o.value) };
		return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, jsonable(x)]));
	}
	return v;
}

interface ExpectedRecord {
	id?: string;
	version?: number;
	dataFormat?: string;
	data_hex: string;
	flex?: unknown;
	flex_error?: string;
}

interface Expected {
	name: string;
	format?: string;
	records?: ExpectedRecord[];
	header?: unknown;
}

function loadCases(): { name: string; expected: Expected; payload: Uint8Array }[] {
	const cases = [];
	// Only the published DB specimen tickets: real tickets never go in tests.
	for (const sub of ['public']) {
		const dir = join(FIXTURES, sub);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.expected.json')) continue;
			const expected = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Expected;
			const payload = new Uint8Array(readFileSync(join(dir, f.replace('.expected.json', '.bin'))));
			cases.push({ name: f.replace('.expected.json', ''), expected, payload });
		}
	}
	return cases;
}

const cases = loadCases();

describe('UPER decoder vs asn1tools ground truth', () => {
	const flexCases = cases.flatMap(({ name, expected }) =>
		(expected.records ?? [])
			.filter((r) => r.flex && (r.id === 'U_FLEX' || r.dataFormat?.startsWith('FCB')))
			.map((r, i) => ({ name: `${name}#${i}`, record: r }))
	);

	it('has fixture data', () => {
		expect(cases.length).toBeGreaterThan(0);
		expect(flexCases.length).toBeGreaterThan(0);
	});

	it.each(flexCases)('decodes FCB payload $name', ({ record }) => {
		const version = record.id === 'U_FLEX' ? record.version! : parseInt(record.dataFormat!.slice(3));
		const schema = FCB[version];
		expect(schema, `no schema for FCB version ${version}`).toBeDefined();
		const decoded = decodeUper(schema, hexToBytes(record.data_hex));
		expect(jsonable(decoded)).toEqual(record.flex);
	});

	const dosipasCases = cases.filter(({ expected }) => expected.format?.startsWith('dosipas'));

	it.each(dosipasCases)('decodes DOSIPAS header $name', ({ expected, payload }) => {
		const schema = (expected.format === 'dosipas-u1' ? header1 : header2) as AsnSchema;
		const decoded = decodeUper(schema, payload);
		expect(jsonable(decoded)).toEqual(expected.header);
	});
});
