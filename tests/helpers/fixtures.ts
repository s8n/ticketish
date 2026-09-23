// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * DB's published Muster specimens, as committed under tests/fixtures/public.
 *
 * The directory is part of the repository, so a missing file is a broken
 * checkout rather than a reason to skip: these throw, and a test that reads
 * one fails instead of passing with nothing checked.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FIXTURES = fileURLToPath(new URL('../fixtures/public', import.meta.url));

/** The payload of a committed specimen, by file name. */
export function publicFixture(name: string): Uint8Array {
	const path = join(PUBLIC_FIXTURES, name);
	if (!existsSync(path)) throw new Error(`committed fixture ${name} is missing`);
	return new Uint8Array(readFileSync(path));
}

/** Every file name in the directory, which has to be there. */
export function publicFixtureNames(): string[] {
	if (!existsSync(PUBLIC_FIXTURES)) throw new Error('tests/fixtures/public is missing');
	return readdirSync(PUBLIC_FIXTURES);
}
