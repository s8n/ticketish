// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * SwissPass / NOVA: a protobuf SignedTicket in a QR code. The message is
 * encoded by the test, so no real ticket is involved.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { parseSwissPass, fmtZurich } from '../src/lib/tickets/swisspass/swisspass.ts';
import {
	loadNovaOrgs,
	novaOrgCode,
	novaOrgLabel,
	type NovaOrg
} from '../src/lib/tickets/swisspass/orgs.ts';
import { concat } from './helpers/build.ts';
import orgsJson from '../src/lib/tickets/swisspass/orgs.json' with { type: 'json' };
import { msg, signedTicket, str, time, uint } from './helpers/swisspass.ts';

const VALID_FROM = Date.UTC(2024, 4, 19, 8, 0);
const VALID_UNTIL = Date.UTC(2024, 4, 19, 12, 0);

function swissPass({ withTraveler = true, specimen = false, rics = '3342' } = {}) {
	const tariff = msg(
		2,
		msg(1, uint(1, 1), str(2, 'Test Einzelbillett')), // product: language DE, name
		uint(4, 2), // travel class: second
		str(6, 'Zonen 100 200'), // route
		time(8, VALID_FROM),
		time(9, VALID_UNTIL),
		uint(12, 4321), // product number
		msg(13, uint(2, 100), uint(3, 452)), // zone
		msg(13, uint(2, 200), uint(3, 452)),
		str(15, '(2.)(V)'),
		uint(19, 3) // route type: zone ticket
	);
	const traveler = msg(
		3,
		str(1, '12345678'),
		str(2, '00000000-0000-0000-0000-000000000000'),
		str(3, 'Mustermann'),
		str(4, 'Erika'),
		time(5, Date.UTC(1985, 2, 27)),
		str(7, 'PERSON_16+')
	);
	const ticket = concat(
		uint(1, 987654321),
		tariff,
		...(withTraveler ? [traveler] : []),
		msg(5, time(1, VALID_FROM), uint(2, 1), uint(3, 7646), uint(4, 490)), // sale
		msg(6, str(1, 'MC'), str(2, 'CHF'), str(3, '5.00')), // payment
		...(specimen ? [msg(7, uint(3, 1))] : [])
	);
	return signedTicket(ticket, rics);
}

describe('orgs.json', () => {
	const table: Record<string, NovaOrg> = orgsJson.orgs;

	it('keeps the source credit beside the data', () => {
		// the terms ask for opentransportdata.swiss to be named as the source of
		// the raw data, so it travels in the file rather than only in the credits
		expect(orgsJson._note).toMatch(/opentransportdata\.swiss/);
		expect(orgsJson._note).toMatch(/up to date/i);
	});

	it('is a map of organisation numbers to non-empty names', () => {
		const entries = Object.entries(table);
		expect(entries.length).toBeGreaterThan(1000);
		for (const [id, org] of entries) {
			// decimal, and never padded: the register writes 11, not 011
			expect(id, `key ${id}`).toMatch(/^[1-9]\d*$/);
			expect(org.n.trim(), `name for ${id}`).not.toBe('');
			expect(org.until ?? '9999-12-31', `until for ${id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('leaves out the end of validity for a number that has none', () => {
		// atlas writes an open-ended row as 9999-12-31, which is not a date
		// worth carrying into the app
		expect(Object.values(table).some((o) => o.until)).toBe(true);
		expect(Object.values(table).every((o) => o.until !== '9999-12-31')).toBe(true);
	});
});

describe('SwissPass tickets', () => {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	it('decodes the protobuf structure', () => {
		const t = parseSwissPass(swissPass());
		expect(t.keyMeta?.rics).toBe('3342');
		const data = t.ticketData as any;
		expect(data.ticketId).toBe(987654321);
		expect(data.tariff.product.name).toBe('Test Einzelbillett');
		expect(data.tariff.travelClass).toBe('second');
		expect(data.tariff.route).toEqual(['Zonen 100 200']);
		expect(data.tariff.validFrom).toBe(VALID_FROM);
		expect(data.tariff.validUntil).toBe(VALID_UNTIL);
		expect(data.tariff.zones.map((z: any) => z.zoneId)).toEqual([100, 200]);
		expect(data.payment.price).toBe('5.00');
		expect(data.payment.currency).toBe('CHF');
		expect(data.sale.issuingOrg).toBe(490);
	});

	it('reads traveller details when present', () => {
		const data = parseSwissPass(swissPass()).ticketData as any;
		expect(data.traveler.forename).toBe('Erika');
		expect(data.traveler.surname).toBe('Mustermann');
		expect(data.traveler.tariff).toBe('PERSON_16+');
	});

	it('copes with a ticket that carries no traveller', () => {
		const data = parseSwissPass(swissPass({ withTraveler: false })).ticketData as any;
		expect(data.traveler).toBeUndefined();
		expect(data.tariff.product.name).toBe('Test Einzelbillett');
	});

	it('exposes the specimen flag', () => {
		const plain = parseSwissPass(swissPass()).ticketData as any;
		const marked = parseSwissPass(swissPass({ specimen: true })).ticketData as any;
		expect(plain.extra?.specimen).toBeUndefined();
		expect(marked.extra.specimen).toBe(true);
	});

	it('names known transport organisations', async () => {
		const orgs = await loadNovaOrgs();
		expect(novaOrgLabel(orgs, 490)).toMatch(/Z(ü|u)rcher Verkehrsverbund/);
		// the register keys on the plain number, and a ticket may pad it
		expect(novaOrgLabel(orgs, '011')).toBe(novaOrgLabel(orgs, 11));
		expect(novaOrgLabel(orgs, 999999)).toBeNull();
		expect(novaOrgLabel(null, 490)).toBeNull();
	});

	it("says when a number stopped being anybody's, as of the day it is read", () => {
		const orgs = { '70': { n: 'Südostbahn Gemeinschaft', a: 'SOB Gem', until: '2001-10-12' } };
		expect(novaOrgLabel(orgs, 70, new Date('2001-01-01'))).toBe(
			'SOB Gem (Südostbahn Gemeinschaft)'
		);
		expect(novaOrgLabel(orgs, 70, new Date('2026-08-12'))).toBe(
			'SOB Gem (Südostbahn Gemeinschaft) (Expired 2001-10-12, GO-Nr. 70)'
		);
		// the last day of validity is still a day of validity
		expect(novaOrgLabel(orgs, 70, new Date('2001-10-12'))).not.toContain('Expired');
	});

	it('reads a number the way the register writes it', () => {
		expect(novaOrgCode('011')).toBe('11');
		expect(novaOrgCode(11)).toBe('11');
		expect(novaOrgCode('')).toBeNull();
		expect(novaOrgCode('eleven')).toBeNull();
	});

	it('formats times in Swiss local time', () => {
		// 08:00 UTC in May is 10:00 in Zurich
		expect(fmtZurich(VALID_FROM)).toContain('10:00');
		expect(fmtZurich(null)).toBeNull();
	});

	it('is reached through the format dispatcher', () => {
		expect(parsePayload(swissPass()).kind).toBe('swisspass');
	});

	it('does not claim unrelated binary data', () => {
		expect(() => parseSwissPass(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
	});
});
