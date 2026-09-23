// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Every data table carries its `_note`: where it came from, on what terms,
 * and how it is rebuilt, so the obligation travels with the file. A new
 * table fails here until it says so, or until it is listed below with the
 * reason it has none.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Files that are not data tables, or whose terms live elsewhere. */
const EXEMPT: Record<string, string> = {
	'src/lib/tickets/asn1/schemas/fcb1.json': 'compiled ASN.1 schema; UIC terms in scripts/asn-specs',
	'src/lib/tickets/asn1/schemas/fcb2.json': 'compiled ASN.1 schema; UIC terms in scripts/asn-specs',
	'src/lib/tickets/asn1/schemas/fcb3.json': 'compiled ASN.1 schema; UIC terms in scripts/asn-specs',
	'src/lib/tickets/asn1/schemas/header1.json': 'compiled ASN.1 schema; UIC terms in scripts/asn-specs',
	'src/lib/tickets/asn1/schemas/header2.json': 'compiled ASN.1 schema; UIC terms in scripts/asn-specs',
	'src/lib/tickets/rsp/keys.json': 'public keys, credited in LICENSE.md',
	'src/lib/tickets/vdv/ca-keys.json': 'public keys, credited in LICENSE.md',
	'src/lib/tickets/data/uic-countries.json': 'reference codes, credited in LICENSE.md'
};

const tables = execFileSync('git', ['ls-files', 'src/**/*.json'], { encoding: 'utf8' })
	.split('\n')
	.filter(Boolean);

describe('data tables', () => {
	it('are all accounted for', () => {
		expect(tables.length).toBeGreaterThan(0);
	});

	it.each(tables.filter((path) => !(path in EXEMPT)))('%s carries a _note', (path) => {
		const table = JSON.parse(readFileSync(path, 'utf8'));
		expect(typeof table._note, path).toBe('string');
		expect(table._note.length).toBeGreaterThan(40);
	});
});
