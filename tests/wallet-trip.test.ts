// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The mapping from a parsed ticket to the handful of fields a wallet pass can
 * hold. This is the lossy step, so what it drops matters as much as what it
 * keeps, and both are asserted here.
 *
 * The UIC cases run against DB's published Muster specimens, which are
 * committed and are not anybody's travel. The VDV case is built with a
 * throwaway key, like every other VDV test.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeTicket } from '../src/lib/tickets/parse.ts';
import { parseVdv } from '../src/lib/tickets/vdv/vdv.ts';
import {
	hasMapping,
	previewFields,
	tripFor,
	tripTitle,
	asUtcInstant,
	fcbUtcOffset,
	localParts,
	utcOffsetLabel
} from '../src/lib/wallet/trip.ts';
import type { ParsedTicket } from '../src/lib/tickets/types.ts';
import { tlv } from './helpers/build.ts';
import { buildVdv, vdvDateTime, vdvHeader } from './helpers/vdv.ts';

const dir = fileURLToPath(new URL('./fixtures/public', import.meta.url));

function muster(name: string): ParsedTicket | null {
	const path = join(dir, name);
	if (!existsSync(path)) return null;
	return makeTicket(new Uint8Array(readFileSync(path)), { kind: 'raw', fileName: name });
}

describe('which formats are exported at all', () => {
	it('exports the two that have an intentional mapping', () => {
		expect(hasMapping({ kind: 'uic9183' } as never)).toBe(true);
		expect(hasMapping({ kind: 'vdv' } as never)).toBe(true);
		expect(hasMapping({ kind: 'dosipas' } as never)).toBe(true);
	});

	it('stays out of the way of the formats that do not', () => {
		// a pass built from a format nobody mapped would be a guess, and the
		// guess is read by a ticket inspector
		for (const kind of ['rsp6', 'swisspass', 'mav', 'elb', 'text', 'unknown']) {
			expect(hasMapping({ kind } as never)).toBe(false);
		}
	});
});

describe('a DB ticket with a train binding', () => {
	it('becomes a journey with the train, the route and the departure', async () => {
		const ticket = muster('muster-918-9-fv-supersparpreis.bin');
		if (!ticket) return;
		const trip = (await tripFor(ticket))!;

		expect(trip.shape).toBe('journey');
		expect(trip.train).toBe('ICE573');
		expect(trip.from).toBe('Mannheim');
		expect(trip.to).toBe('Reutlingen');
		expect(trip.departure).toBe('2022-04-22T11:59');
		expect(trip.travelClass).toBe('2nd class');
		expect(tripTitle(trip)).toBe('Mannheim to Reutlingen');
	});
});

describe('a flexible ticket with a route but no train', () => {
	it('is still a journey, because the route is the point of it', async () => {
		const ticket = muster('muster-918-9-normalpreis.bin');
		if (!ticket) return;
		const trip = (await tripFor(ticket))!;

		expect(trip.shape).toBe('journey');
		expect(trip.from).toBe('Mainz');
		expect(trip.to).toBe('Koblenz');
		expect(trip.train).toBeUndefined();
		expect(trip.validFrom).toBe('2022-10-30T00:00');
	});
});

describe('a ticket that is an area and a date range', () => {
	it('becomes a period pass rather than a route with two blanks', async () => {
		const ticket = muster('muster-918-9-deutschland-ticket.bin');
		if (!ticket) return;
		const trip = (await tripFor(ticket))!;

		expect(trip.shape).toBe('period');
		expect(trip.from).toBeUndefined();
		expect(trip.to).toBeUndefined();
		expect(trip.validFrom).toBe('2025-02-27T10:14');
		expect(trip.price).toBe('58.00 EUR');
		expect(tripTitle(trip)).toBe('Fahrkarte');
	});
});

describe('a 918.3 ticket read out of its 0080BL block', () => {
	it('takes the product, the fare and the head count from DB own record', async () => {
		const ticket = muster('muster-918-3-quer-durchs-land-ticket.bin');
		if (!ticket) return;
		const trip = (await tripFor(ticket))!;

		expect(trip.product).toBe('Quer-Durchs-Land-Ticket');
		expect(trip.validFrom).toBe('2021-01-14');
		expect(trip.ticketId).toBe('EZBG7S-2');
		expect(trip.details).toContainEqual({ label: 'Fare', value: 'Normalpreis' });
		expect(trip.details).toContainEqual({ label: 'Travellers', value: '1 adult' });
	});
});

describe('a VDV ticket', () => {
	const built = buildVdv({
		header: vdvHeader({
			ticketId: 12345678,
			ticketOrgId: 77,
			productNumber: 9999,
			productOrgId: 6292,
			validFrom: vdvDateTime(2024, 5, 1, 0, 0),
			validUntil: vdvDateTime(2024, 6, 1, 3, 0)
		}),
		productData: tlv(0xda, new Uint8Array(17))
	});

	const ticket: ParsedTicket = {
		id: 'test',
		source: { kind: 'raw' },
		raw: built.barcode,
		container: { kind: 'vdv', barcode: parseVdv(built.barcode, built.caKeys) },
		scannedAt: 0
	};

	it('is a period pass named by its organisation and product', async () => {
		const trip = (await tripFor(ticket))!;
		expect(trip.shape).toBe('period');
		// 6292 is corrected by hand in orgs.ts, so it names the operator
		expect(trip.issuer).toBe('Münchner Verkehrsgesellschaft (MVG)');
		// 6292/9999 is in the product table, so the pass names the product
		// rather than repeating the number the barcode carries
		expect(trip.product).toBe('Deutschlandticket');
		expect(trip.validFrom).toBe('2024-05-01T00:00:00');
		expect(trip.validUntil).toBe('2024-06-01T03:00:00');
		expect(trip.ticketId).toBe('12345678');
	});

	it('does not invent a route, because the barcode has none', async () => {
		const trip = (await tripFor(ticket))!;
		expect(trip.from).toBeUndefined();
		expect(trip.to).toBeUndefined();
		expect(trip.train).toBeUndefined();
	});
});

describe('what the reader is shown before exporting', () => {
	it('names the operator, which is what comes off the ticket', async () => {
		const ticket = muster('muster-918-9-fv-supersparpreis.bin');
		if (!ticket) return;
		const rows = previewFields((await tripFor(ticket))!);
		expect(rows[0]).toEqual({ label: 'Operator', value: 'DB AG' });
	});

	it('leaves nothing on the pass unshown', async () => {
		for (const name of [
			'muster-918-9-fv-supersparpreis.bin',
			'muster-918-3-quer-durchs-land-ticket.bin',
			'muster-918-9-deutschland-ticket.bin'
		]) {
			const ticket = muster(name);
			if (!ticket) continue;
			const trip = (await tripFor(ticket))!;
			const shown = previewFields(trip)
				.map((r) => r.value)
				.join(' | ');

			// the preview writes a date-time with a space, so compare on that
			// form; anything else is shown as the mapping produced it
			const asShown = (value: string) =>
				/^\d{4}-\d{2}-\d{2}T/.test(value) ? value.replace('T', ' ') : value;

			// every field the mapping filled has to turn up in the preview, or
			// it reads as one the mapping dropped
			for (const [key, value] of Object.entries(trip)) {
				if (key === 'shape' || typeof value !== 'string') continue;
				expect(shown, `${name} does not show ${key}`).toContain(asShown(value));
			}
			for (const detail of trip.details) expect(shown).toContain(detail.value);
		}
	});

	it('skips the fields the format did not fill', () => {
		const rows = previewFields({
			shape: 'period',
			issuer: 'Test Verbund',
			validFrom: '2026-01-01T00:00',
			details: []
		});
		expect(rows.map((r) => r.label)).toEqual(['Operator', 'Valid from']);
		expect(rows[0].value).toBe('Test Verbund');
	});
});

describe('reading the local times these formats carry', () => {
	it('splits a date from a time, and refuses anything else', () => {
		expect(localParts('2026-09-01T08:15')).toEqual({ date: '2026-09-01', time: '08:15' });
		expect(localParts('2026-09-01')).toEqual({ date: '2026-09-01', time: null });
		expect(localParts('2026')).toBeNull();
		expect(localParts(undefined)).toBeNull();
	});

	it('reads the wall clock as UTC when nothing said otherwise', () => {
		expect(asUtcInstant('2026-09-01T08:15')).toBe('2026-09-01T08:15:00Z');
		expect(asUtcInstant('2026-09-01')).toBe('2026-09-01T00:00:00Z');
	});

	it('uses the offset where the ticket carried one', () => {
		expect(asUtcInstant('2026-09-01T08:15', 120)).toBe('2026-09-01T06:15:00Z');
		expect(asUtcInstant('2026-09-01T08:15', -300)).toBe('2026-09-01T13:15:00Z');
		// across midnight, which is where an offset stops being cosmetic
		expect(asUtcInstant('2026-09-01T00:30', 120)).toBe('2026-08-31T22:30:00Z');
	});

	it('turns FCB quarter hours into minutes east of UTC', () => {
		// the spec has UTC = local + offset * 15, so the sign runs backwards
		expect(fcbUtcOffset(-8)).toBe(120);
		expect(fcbUtcOffset(20)).toBe(-300);
		expect(fcbUtcOffset(0)).toBe(0);
		expect(fcbUtcOffset(undefined)).toBeUndefined();
		expect(utcOffsetLabel(120)).toBe('+02:00');
		expect(utcOffsetLabel(-330)).toBe('-05:30');
	});

	it('takes the offset off a real ticket', async () => {
		const ticket = muster('muster-918-9-fv-supersparpreis.bin');
		if (!ticket) return;
		// a German departure in April: summer time, UTC+2
		expect((await tripFor(ticket))!.utcOffset).toBe(120);
	});
});
