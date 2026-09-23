// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * zxing-wasm fetches its reader binary from a CDN unless it is told where the
 * bundled one is, and `src/lib/input/zxing-reader.ts` is where it is told.
 * A decode that reaches the package any other way can be the first one of a
 * session and go to the network, so nothing else may import it for reading.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const GATE = 'lib/input/zxing-reader.ts';

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

/** A value import from the reader package; `import type` is harmless. */
const READER_IMPORT = /import\s+(?!type\b)[^;]*?from\s+['"]zxing-wasm\/reader['"]/;

describe('zxing reader', () => {
	it('is only imported for use through the module that prepares it', () => {
		const offenders = walk(SRC)
			.filter((path) => /\.(ts|svelte)$/.test(path))
			.map((path) => relative(SRC, path))
			.filter((path) => path !== GATE)
			.filter((path) => READER_IMPORT.test(readFileSync(join(SRC, path), 'utf8')));
		expect(offenders).toEqual([]);
	});
});
