// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The export section appears for the formats that have a mapping and for no
 * others. Rendered server side, which is enough to check the gate: the point
 * is that an unmapped ticket offers nothing at all rather than offering a
 * button that would build a pass out of guesses.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import WalletExport from '../src/lib/components/WalletExport.svelte';
import { makeTicket } from '../src/lib/tickets/parse.ts';

const dir = fileURLToPath(new URL('./fixtures/public', import.meta.url));

describe('the wallet section', () => {
	it('offers itself for a UIC ticket', () => {
		const path = join(dir, 'muster-918-9-fv-supersparpreis.bin');
		if (!existsSync(path)) return;
		const ticket = makeTicket(new Uint8Array(readFileSync(path)), { kind: 'raw' });
		const { body } = render(WalletExport, { props: { ticket } });
		expect(body).toContain('Add to a phone wallet');
	});

	it('is absent for a payload nobody mapped', () => {
		const ticket = makeTicket(new TextEncoder().encode('JUST SOME TEXT'), { kind: 'raw' });
		expect(ticket.container.kind).toBe('text');
		const { body } = render(WalletExport, { props: { ticket } });
		expect(body).not.toContain('Add to a phone wallet');
		// nothing but Svelte's own anchor comments
		expect(body.replace(/<!--.*?-->/g, '').trim()).toBe('');
	});
});
