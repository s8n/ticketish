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
import { concat, tlv } from './helpers/build.ts';
import { ascii, renfeAztec, renfeBlockB } from './helpers/renfe.ts';
import { buildVdv, vdvDateTime, vdvHeader } from './helpers/vdv.ts';
import { msg, signedTicket, str, time, uint } from './helpers/swisspass.ts';

const dir = fileURLToPath(new URL('./fixtures/public', import.meta.url));

function muster(name: string): ParsedTicket | null {
	const path = join(dir, name);
	if (!existsSync(path)) return null;
	return makeTicket(new Uint8Array(readFileSync(path)), { kind: 'raw', fileName: name });
}

describe('which formats are exported at all', () => {
	it('exports the ones that have an intentional mapping', () => {
		expect(hasMapping({ kind: 'uic9183' } as never)).toBe(true);
		expect(hasMapping({ kind: 'vdv' } as never)).toBe(true);
		expect(hasMapping({ kind: 'dosipas' } as never)).toBe(true);
		expect(hasMapping({ kind: 'swisspass' } as never)).toBe(true);
		expect(hasMapping({ kind: 'renfe' } as never)).toBe(true);
	});

	it('stays out of the way of the formats that do not', () => {
		// a pass built from a format nobody mapped would be a guess, and the
		// guess is read by a ticket inspector
		for (const kind of ['rsp6', 'mav', 'elb', 'text', 'unknown']) {
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

describe('a SwissPass ticket', () => {
	// summer, so Zurich is UTC+2 and the offset is not the winter one
	const VALID_FROM = Date.UTC(2026, 6, 3, 3, 0);
	const VALID_UNTIL = Date.UTC(2026, 6, 3, 21, 59);

	function nova(parts: { tariff: Uint8Array[]; body?: Uint8Array[]; rics?: string }) {
		const ticket = concat(
			uint(1, 123456789),
			msg(2, ...parts.tariff),
			msg(5, time(1, Date.UTC(2026, 5, 30, 9, 12)), uint(4, 11)), // sale, by SBB
			msg(6, str(1, 'MC'), str(2, 'CHF'), str(3, '52.00')), // payment
			...(parts.body ?? [])
		);
		return makeTicket(signedTicket(ticket, parts.rics ?? '1185'), {
			kind: 'raw',
			fileName: 'nova.bin'
		});
	}

	const route = [
		msg(1, uint(1, 1), str(2, 'Spartageskarte')),
		str(2, 'Zürich HB'),
		str(3, 'Lugano'),
		uint(4, 1), // travel class: first
		str(6, 'via Gotthard'),
		time(8, VALID_FROM),
		time(9, VALID_UNTIL),
		uint(19, 2) // route type: route ticket
	];

	it('names the organisation that sold it, not the key that signed it', async () => {
		// the sale block says org 11, and the signing key is 1185: a Swiss
		// ticket is often signed by one body on behalf of the seller, and the
		// seller is who a pass is about
		const trip = (await tripFor(nova({ tariff: route })))!;
		expect(trip.issuer).toBe('Schweizerische Bundesbahnen SBB');
	});

	it('falls back to the signing key when the sale names no organisation', async () => {
		const ticket = concat(
			uint(1, 123456789),
			msg(2, ...route),
			msg(5, time(1, Date.UTC(2026, 5, 30, 9, 12))) // sale, with no org
		);
		const trip = (await tripFor(
			makeTicket(signedTicket(ticket, '1185'), { kind: 'raw', fileName: 'nova.bin' })
		))!;
		expect(trip.issuer).toMatch(/Swiss Federal Railways/);
	});

	it('becomes a journey over the two stations it names', async () => {
		const trip = (await tripFor(nova({ tariff: route })))!;
		expect(trip.shape).toBe('journey');
		expect(trip.from).toBe('Zürich HB');
		expect(trip.to).toBe('Lugano');
		expect(trip.via).toBe('via Gotthard');
		expect(trip.product).toBe('Spartageskarte');
		expect(trip.travelClass).toBe('1st class');
		expect(trip.price).toBe('52.00 CHF');
		expect(trip.ticketId).toBe('123456789');
	});

	it('turns the instants it carries into Swiss local time and a real offset', async () => {
		const trip = (await tripFor(nova({ tariff: route })))!;
		// 03:00 UTC on a July day is 05:00 in Zurich, at UTC+2
		expect(trip.validFrom).toBe('2026-07-03T05:00');
		expect(trip.validUntil).toBe('2026-07-03T23:59');
		expect(trip.utcOffset).toBe(120);
		// a validity window is not a departure, so the pass claims no train time
		expect(trip.departure).toBeUndefined();
	});

	it('reads the offset off the instant rather than assuming one', async () => {
		const winter = [
			msg(1, uint(1, 1), str(2, 'Spartageskarte')),
			str(2, 'Zürich HB'),
			str(3, 'Chur'),
			time(8, Date.UTC(2026, 0, 9, 6, 30))
		];
		const trip = (await tripFor(nova({ tariff: winter })))!;
		expect(trip.validFrom).toBe('2026-01-09T07:30');
		expect(trip.utcOffset).toBe(60);
	});

	it('takes the seat off the first leg and names the rest on the back', async () => {
		const trip = (await tripFor(
			nova({
				tariff: route,
				body: [
					msg(8, str(11, 'IC 21'), str(12, '7'), str(13, '52'), str(13, '54')),
					msg(8, str(11, 'IR 46'), str(12, '3'))
				]
			})
		))!;
		expect(trip.train).toBe('IC 21');
		expect(trip.coach).toBe('7');
		expect(trip.seat).toBe('52, 54');
		expect(trip.details).toContainEqual({ label: 'Further legs', value: 'IR 46 carriage 3' });
	});

	it('shows a zone ticket as an area rather than a route', async () => {
		const trip = (await tripFor(
			nova({
				tariff: [
					msg(1, uint(1, 1), str(2, 'Tageskarte 2 Zonen')),
					time(8, VALID_FROM),
					time(9, VALID_UNTIL),
					msg(13, uint(2, 110), uint(3, 490)),
					msg(13, uint(2, 121), uint(3, 490)),
					uint(19, 3) // route type: zone ticket
				]
			})
		))!;
		expect(trip.shape).toBe('period');
		expect(trip.from).toBeUndefined();
		expect(trip.details).toContainEqual({ label: 'Zones', value: '110, 121' });
		// the zones are the association's, so the pass is the association's
		expect(trip.operator).toEqual({ scheme: 'nova', code: 490 });
	});

	it('keeps the return half where a one-direction pass cannot show it', async () => {
		const trip = (await tripFor(
			nova({
				tariff: [
					...route,
					uint(5, 2), // journey type: return
					time(10, Date.UTC(2026, 6, 5, 4, 0)),
					time(11, Date.UTC(2026, 6, 5, 21, 0))
				]
			})
		))!;
		expect(trip.details).toContainEqual({
			label: 'Return valid',
			value: '2026-07-05 06:00 to 2026-07-05 23:00'
		});
	});

	it('names the traveller and the reduction the ticket was sold on', async () => {
		const trip = (await tripFor(
			nova({
				tariff: route,
				body: [msg(3, str(3, 'Muster'), str(4, 'Max'), str(7, 'PERSON_16+'))]
			})
		))!;
		expect(trip.passenger).toBe('Max Muster');
		expect(trip.details).toContainEqual({ label: 'Reduction', value: 'PERSON_16+' });
	});

	it('says when a ticket is only a specimen', async () => {
		const trip = (await tripFor(nova({ tariff: route, body: [msg(7, uint(3, 1))] })))!;
		expect(trip.details).toContainEqual({
			label: 'Specimen',
			value: 'sample ticket, not valid for travel'
		});
	});

	it('offers no pass for a ticket with nothing on it but a barcode', async () => {
		expect(await tripFor(nova({ tariff: [uint(4, 2)] }))).toBeNull();
	});
});

describe('a Renfe ticket', () => {
	const renfe = (payload: Uint8Array): ParsedTicket =>
		makeTicket(payload, { kind: 'raw', fileName: 'renfe.bin' });

	it('is a journey with the train, the seat and the localizador', async () => {
		const trip = (await tripFor(renfe(renfeAztec())))!;
		expect(trip.shape).toBe('journey');
		expect(trip.from).toBe('BARCELONA-SANTS');
		expect(trip.to).toBe('MADRID-PUERTA DE ATOCHA-ALMUDENA GRANDES');
		expect(trip.departure).toBe('2024-05-19T11:00');
		expect(trip.train).toBe('3112');
		expect(trip.coach).toBe('18');
		expect(trip.seat).toBe('15B');
		expect(trip.reference).toBe('TESTAB');
		expect(trip.ticketId).toBe('7250000000001');
		expect(trip.details).toContainEqual({ label: 'Verification code', value: 'C3HGJ' });
		expect(tripTitle(trip)).toBe('BARCELONA-SANTS to MADRID-PUERTA DE ATOCHA-ALMUDENA GRANDES');
	});

	it('reads the company code as Renfe, since Renfe is what it may be', async () => {
		// 1071 is Renfe Operadora in ERA's register, which is where the name
		// comes from now that rics.json no longer guesses at this one
		const trip = (await tripFor(renfe(renfeAztec())))!;
		expect(trip.issuer).toBe('Renfe Operadora');
		expect(trip.operator).toEqual({ scheme: 'rics', code: 1071 });
	});

	it('refuses to read the code as anybody else, whatever number it holds', async () => {
		// 01080 is DB Fernverkehr in the RICS register, and a Renfe ticket
		// carrying it is not evidence that the field is a RICS code at all: a
		// pass in DB's name and DB's red would be the wrong claim to make
		const trip = (await tripFor(renfe(renfeAztec({ company: '01080' }))))!;
		expect(trip.issuer).toBe('Renfe');
		expect(trip.operator).toBeUndefined();
		expect(trip.details).toContainEqual({ label: 'Company code', value: '1080' });
	});

	it('shows a station it cannot name as the code the barcode carried', async () => {
		const trip = (await tripFor(renfe(renfeAztec({ destination: '0099999' }))))!;
		expect(trip.from).toBe('BARCELONA-SANTS');
		expect(trip.to).toBe('Station 99999');
	});

	it('keeps the short form a journey, because the train is the point of it', async () => {
		const trip = (await tripFor(renfe(ascii(renfeBlockB()))))!;
		expect(trip.shape).toBe('journey');
		expect(trip.train).toBe('3112');
		expect(trip.seat).toBe('15B');
		// the short barcode carries neither, so the pass claims neither and
		// says on the back why the route is missing
		expect(trip.from).toBeUndefined();
		expect(trip.departure).toBe('2024-05-19');
		expect(trip.details).toContainEqual({
			label: 'Barcode',
			value: 'the short Renfe form, which carries no stations and no departure time'
		});
	});

	it('leaves nothing it mapped out of the preview', async () => {
		for (const payload of [renfeAztec(), ascii(renfeBlockB())]) {
			const trip = (await tripFor(renfe(payload)))!;
			const shown = previewFields(trip)
				.map((r) => r.value)
				.join(' | ');
			for (const [key, value] of Object.entries(trip)) {
				if (key === 'shape' || typeof value !== 'string') continue;
				// only a date-time is rewritten for display, so a localizador
				// with a T in it is compared as it stands
				const asShown = /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.replace('T', ' ') : value;
				expect(shown, `renfe pass does not show ${key}`).toContain(asShown);
			}
		}
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
