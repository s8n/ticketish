// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The export section appears for the formats that have a mapping and for no
 * others, and only under the barcode tab. Rendered server side, which is
 * enough to check the gates: the point is that an unmapped ticket offers
 * nothing at all rather than offering a button that would build a pass out of
 * guesses.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TicketCard from '../src/lib/components/TicketCard.svelte';
import WalletExport from '../src/lib/components/WalletExport.svelte';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { publicFixture } from './helpers/fixtures.ts';


describe('the wallet section', () => {
	it('offers itself for a UIC ticket', () => {
		const ticket = makeTicket(publicFixture('muster-918-9-fv-supersparpreis.bin'), { kind: 'raw' });
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

	it('lives under the barcode tab, not at the foot of the card', () => {
		const ticket = makeTicket(
			publicFixture('muster-918-9-fv-supersparpreis.bin'),
			{ kind: 'raw', fileName: 'muster.bin' },
			{ format: 'Aztec', size: { width: 47, height: 47 } }
		);
		const { body } = render(TicketCard, { props: { ticket } });
		// the card opens on its richest record, so the barcode is a tab away
		// and so is the pass
		expect(body).toContain('Barcode');
		expect(body).not.toContain('Add to a phone wallet');
	});
});
