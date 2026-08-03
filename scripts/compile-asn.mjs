// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

// Compiles the vendored UIC ASN.1 specs (scripts/asn-specs/*.asn) into JSON
// schemas consumed by the UPER runtime (src/lib/tickets/asn1/uper.ts).
//
// This is NOT a general ASN.1 compiler. It supports exactly the subset used by
// the UIC FCB / barcode-header specs: top-level assignments of SEQUENCE,
// CHOICE, ENUMERATED, SEQUENCE OF and primitives (INTEGER, IA5String,
// UTF8String, OCTET STRING, OBJECT IDENTIFIER, BOOLEAN, BIT STRING) with
// SIZE/value-range constraints, OPTIONAL/DEFAULT and `...` extension markers.
// Anything else throws, so schema drift fails loudly at generation time.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = join(HERE, 'asn-specs');
const OUT_DIR = join(HERE, '..', 'src', 'lib', 'tickets', 'asn1', 'schemas');

const SPECS = [
	['uicRailTicketData_v1.3.5.asn', 'fcb1.json', 'UicRailTicketData'],
	['uicRailTicketData_v2.0.3.asn', 'fcb2.json', 'UicRailTicketData'],
	['uicRailTicketData_v3.0.7.asn', 'fcb3.json', 'UicRailTicketData'],
	['uicBarcodeHeader_v1.0.0.asn', 'header1.json', 'UicBarcodeHeader'],
	['uicBarcodeHeader_v2.0.1.asn', 'header2.json', 'UicBarcodeHeader']
];

function stripComments(src) {
	// ASN.1 line comments: "--" to end of line (these specs never close a
	// comment with a second "--" mid-line, they are banner/trailing comments).
	return src
		.split('\n')
		.map((l) => {
			const i = l.indexOf('--');
			return i >= 0 ? l.slice(0, i) : l;
		})
		.join('\n');
}

// Split a brace-enclosed body on commas at depth 0 (nesting: (), {}).
function splitFields(body) {
	const parts = [];
	let depth = 0;
	let cur = '';
	for (const ch of body) {
		if (ch === '(' || ch === '{') depth++;
		else if (ch === ')' || ch === '}') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(cur.trim());
			cur = '';
		} else {
			cur += ch;
		}
	}
	if (cur.trim()) parts.push(cur.trim());
	return parts;
}

function parseIntBound(s) {
	const n = Number(s.trim());
	if (!Number.isSafeInteger(n)) throw new Error(`bad integer bound: ${s}`);
	return n;
}

// Parse constraint text like "(0..1439)", "(SIZE(1..3))", "(SIZE(2))".
// Returns { min, max } or null. Throws on extensible constraints ("...").
function parseRange(text) {
	const m = text.match(/\(\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\)/);
	if (text.includes('...')) throw new Error(`extensible constraint unsupported: ${text}`);
	if (m) return { min: parseIntBound(m[1]), max: parseIntBound(m[2]) };
	const f = text.match(/\(\s*(-?\d+)\s*\)/);
	if (f) return { min: parseIntBound(f[1]), max: parseIntBound(f[1]) };
	throw new Error(`unparsable constraint: ${text}`);
}

// Parse a type expression (no field name, no OPTIONAL/DEFAULT suffix).
function parseType(expr) {
	expr = expr.trim().replace(/\s+/g, ' ');
	let m;
	// Inline constructed types (rare - e.g. the `ticket CHOICE {...}` in DocumentData).
	if ((m = expr.match(/^CHOICE ?\{([\s\S]*)\}$/))) return parseChoice(m[1]);
	if ((m = expr.match(/^ENUMERATED ?\{([\s\S]*)\}$/))) return parseEnum(m[1]);
	if ((m = expr.match(/^SEQUENCE ?\{([\s\S]*)\}$/)) && !/^SEQUENCE ?( SIZE)? ?(\([^)]*\))? ?OF /.test(expr)) {
		return parseSequence(m[1]);
	}
	if ((m = expr.match(/^SEQUENCE( SIZE ?(\([^)]*\)))? OF (.+)$/))) {
		return {
			kind: 'seqof',
			size: m[2] ? parseRange(m[2]) : null,
			of: parseType(m[3])
		};
	}
	if ((m = expr.match(/^INTEGER ?(\(.*\))?$/))) {
		const r = m[1] ? parseRange(m[1]) : null;
		return { kind: 'int', min: r ? r.min : null, max: r ? r.max : null };
	}
	if ((m = expr.match(/^IA5String ?(\( ?SIZE ?\([^)]*\) ?\))?$/))) {
		return { kind: 'ia5', size: m[1] ? parseRange(m[1]) : null };
	}
	if (expr === 'UTF8String') return { kind: 'utf8' };
	if ((m = expr.match(/^OCTET STRING ?(\( ?SIZE ?\([^)]*\) ?\))?$/))) {
		return { kind: 'octets', size: m[1] ? parseRange(m[1]) : null };
	}
	if ((m = expr.match(/^BIT STRING ?(\( ?SIZE ?\([^)]*\) ?\))?$/))) {
		return { kind: 'bits', size: m[1] ? parseRange(m[1]) : null };
	}
	if (expr === 'OBJECT IDENTIFIER') return { kind: 'oid' };
	if (expr === 'BOOLEAN') return { kind: 'bool' };
	if (/^[A-Z][A-Za-z0-9-]*$/.test(expr)) return { kind: 'ref', name: expr };
	throw new Error(`unsupported type expression: "${expr}"`);
}

function parseDefault(text, type) {
	text = text.trim();
	if (/^-?\d+$/.test(text)) return Number(text);
	const str = text.match(/^"(.*)"$/);
	if (str) return str[1];
	if (/^[a-z][A-Za-z0-9-]*$/.test(text)) return text; // enum identifier
	throw new Error(`unsupported DEFAULT: ${text} (type ${JSON.stringify(type)})`);
}

function parseSequence(body) {
	const fields = [];
	let ext = false;
	let sawExt = false;
	for (const part of splitFields(body)) {
		if (part === '...') {
			ext = true;
			sawExt = true;
			continue;
		}
		const m = part.match(/^([a-z][A-Za-z0-9-]*)\s+(.+?)(?:\s+(OPTIONAL|DEFAULT\s+(.+)))?$/s);
		if (!m) throw new Error(`unparsable SEQUENCE field: "${part}"`);
		const type = parseType(m[2]);
		const field = { name: m[1], type };
		if (m[3] === 'OPTIONAL') field.optional = true;
		else if (m[3]) field.default = parseDefault(m[4], type);
		if (sawExt) field.extension = true;
		fields.push(field);
	}
	return { kind: 'sequence', ext, fields };
}

function parseChoice(body) {
	const alts = [];
	let ext = false;
	let sawExt = false;
	for (const part of splitFields(body)) {
		if (part === '...') {
			ext = true;
			sawExt = true;
			continue;
		}
		const m = part.match(/^([a-z][A-Za-z0-9-]*)\s+(.+)$/s);
		if (!m) throw new Error(`unparsable CHOICE alternative: "${part}"`);
		alts.push({ name: m[1], type: parseType(m[2]), extension: sawExt || undefined });
	}
	return {
		kind: 'choice',
		ext,
		alternatives: alts.filter((a) => !a.extension),
		extAlternatives: alts.filter((a) => a.extension).map(({ extension, ...a }) => a)
	};
}

function parseEnum(body) {
	const root = [];
	const extAlts = [];
	let ext = false;
	let sawExt = false;
	for (const part of splitFields(body)) {
		if (part === '...') {
			ext = true;
			sawExt = true;
			continue;
		}
		const m = part.match(/^([a-z][A-Za-z0-9-]*)\s*(?:\((\d+)\))?$/);
		if (!m) throw new Error(`unparsable ENUMERATED item: "${part}"`);
		const item = { name: m[1], value: m[2] !== undefined ? Number(m[2]) : null };
		(sawExt ? extAlts : root).push(item);
	}
	// PER orders root enumerations by ascending value; assign positional
	// values where omitted, then sort.
	root.forEach((it, i) => {
		if (it.value === null) it.value = i;
	});
	root.sort((a, b) => a.value - b.value);
	return {
		kind: 'enum',
		ext,
		root: root.map((i) => i.name),
		extAlternatives: extAlts.map((i) => i.name)
	};
}

function compile(src, rootName) {
	src = stripComments(src);
	const beginIdx = src.indexOf('BEGIN');
	const endIdx = src.lastIndexOf('END');
	if (beginIdx < 0 || endIdx < 0) throw new Error('missing BEGIN/END');
	src = src.slice(beginIdx + 5, endIdx);

	const types = {};
	// Split on assignments: TypeName ::= ...
	const re = /([A-Z][A-Za-z0-9-]*)\s*::=/g;
	const matches = [...src.matchAll(re)];
	for (let i = 0; i < matches.length; i++) {
		const name = matches[i][1];
		const bodyStart = matches[i].index + matches[i][0].length;
		const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : src.length;
		let body = src.slice(bodyStart, bodyEnd).trim();

		let m;
		if ((m = body.match(/^SEQUENCE\s*\{([\s\S]*)\}$/)) && !body.startsWith('SEQUENCE OF')) {
			types[name] = parseSequence(m[1]);
		} else if ((m = body.match(/^CHOICE\s*\{([\s\S]*)\}$/))) {
			types[name] = parseChoice(m[1]);
		} else if ((m = body.match(/^ENUMERATED\s*\{([\s\S]*)\}$/))) {
			types[name] = parseEnum(m[1]);
		} else {
			types[name] = parseType(body);
		}
	}
	if (!types[rootName]) throw new Error(`root type ${rootName} not found`);

	// sanity: all refs resolve
	const check = (t) => {
		if (t.kind === 'ref' && !types[t.name]) throw new Error(`unresolved ref ${t.name}`);
		if (t.kind === 'seqof') check(t.of);
		if (t.kind === 'sequence') t.fields.forEach((f) => check(f.type));
		if (t.kind === 'choice')
			[...t.alternatives, ...t.extAlternatives].forEach((a) => check(a.type));
	};
	Object.values(types).forEach(check);

	return { root: rootName, types };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [specFile, outFile, root] of SPECS) {
	const src = readFileSync(join(SPEC_DIR, specFile), 'utf8');
	const schema = compile(src, root);
	writeFileSync(join(OUT_DIR, outFile), JSON.stringify(schema));
	const n = Object.keys(schema.types).length;
	console.log(`${specFile} -> ${outFile} (${n} types)`);
}
