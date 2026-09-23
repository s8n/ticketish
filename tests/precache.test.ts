// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The service worker's precache list. `cache.addAll` rejects the whole
 * install when a request appears twice, so the list must never repeat one.
 */
import { describe, expect, it } from 'vitest';
import { precacheList } from '../src/lib/precache.ts';

describe('precache list', () => {
	it('names the shell once when prerendered already has it', () => {
		const list = precacheList(['/_app/a.js'], ['/icon.png'], ['/', '/credits'], '/');
		expect(list).toEqual(['/_app/a.js', '/icon.png', '/', '/credits']);
	});

	it('adds the shell when prerendered does not have it', () => {
		expect(precacheList(['/_app/a.js'], [], [], '/')).toEqual(['/_app/a.js', '/']);
	});

	it('leaves out the files the host reads as configuration', () => {
		const list = precacheList([], ['/_headers', '/_redirects', '/_routes.json', '/x.png'], [], '/');
		expect(list).toEqual(['/x.png', '/']);
	});
});
