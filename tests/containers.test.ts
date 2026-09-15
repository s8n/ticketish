// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The per-format entries the ticket card reads.
 *
 * The card writes the issuer line as `issuer ?? 'Unrecognized ticket'`, so an
 * entry that supplies no issuer tells the reader the payload was not
 * recognised while the chip beside it names the format. Every format that was
 * read has somebody or something to put there; the only kinds that may leave
 * it out are the two that really are unidentified.
 */
import { describe, expect, it } from 'vitest';
import { containerInfo } from '../src/lib/components/containers.ts';
import type { TicketContainer } from '../src/lib/tickets/types.ts';

/** `text` names an issuer only when a wallet pass came with the payload. */
const MAY_LACK_ISSUER = new Set(['text', 'unknown']);

/**
 * One container per kind. The payloads behind them are not parsed here: the
 * entries are asked for their label and issuer, and the ones that read a field
 * are given the shallowest object that field lives on.
 */
const SAMPLES: TicketContainer[] = [
	{ kind: 'uic9183', envelope: { envelopeVersion: 2, issuerRics: 1080, records: [] } },
	{ kind: 'dosipas', envelope: { headerVersion: 1, securityProvider: 1080, records: [] } },
	{ kind: 'rsp6', ticket: { ticketType: '06', issuerId: '00' } },
	{ kind: 'swisspass', ticket: {} },
	{ kind: 'vdv', barcode: { tickets: [{ productOrgId: 77 }] } },
	{ kind: 'ssb', envelope: { version: 3, issuerRics: 1080 } },
	{ kind: 'ssb1', ticket: { version: 1, issuerRics: 1080 } },
	{ kind: 'renfe', ticket: {} },
	{ kind: 'tcdd', ticket: {} },
	{ kind: 'trenitalia', ticket: {} },
	{ kind: 'eav', ticket: {} },
	{ kind: 'elb', ticket: { ticketCode: 'IV' } },
	{ kind: 'mav', ticket: { version: 5, issuerRics: 1155 } },
	{ kind: 'viarail', ticket: {} },
	{ kind: 'bcbp', ticket: { version: 6, legs: [], issuerDesignator: 'LH' } },
	{ kind: 'hzpp', ticket: { encrypted: false } },
	{ kind: 'cd-legacy', ticket: {} },
	{ kind: 'nsb', ticket: {} },
	{ kind: 'bob', ticket: { issuer: { issuerId: 1 } } },
	{ kind: 'uz', ticket: {} },
	{ kind: 'sncf-eticket', ticket: {} },
	{ kind: 'kbv-eau', certificate: { bsnr: '900000000' } },
	{ kind: 'text', text: 'hello' },
	{ kind: 'unknown' }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any[];

const ctx = { vdvOrgs: null, issuerNames: null, novaOrgs: null, airlines: null };

describe('container entries', () => {
	it('covers every kind exactly once', () => {
		const kinds = SAMPLES.map((c) => c.kind);
		expect(new Set(kinds).size).toBe(kinds.length);
	});

	it.each(SAMPLES.map((container) => ({ kind: container.kind, container })))(
		'$kind names itself and its issuer',
		({ container }) => {
			const info = containerInfo(container);
			expect(info.label(container)).toBeTruthy();

			if (MAY_LACK_ISSUER.has(container.kind)) return;
			// undefined is the entry not having one at all, which is the case
			// that reaches the reader as "Unrecognized ticket"
			expect(info.issuer, `${container.kind} supplies no issuer`).toBeDefined();
			expect(info.issuer?.(container, ctx), `${container.kind} issuer is empty`).toBeTruthy();
		}
	);

	it('names the practice an eAU was issued at', () => {
		const withBsnr = { kind: 'kbv-eau', certificate: { bsnr: '900000000' } } as TicketContainer;
		expect(containerInfo(withBsnr).issuer?.(withBsnr, ctx)).toBe('Practice 900000000');

		// the BSNR is conditional in the annex, so it can be absent
		const without = { kind: 'kbv-eau', certificate: { bsnr: null } } as TicketContainer;
		expect(containerInfo(without).issuer?.(without, ctx)).toBe('Medical practice');
	});
});
