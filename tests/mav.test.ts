// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * MÁV ticket barcodes, versions 2 to 6.
 *
 * Every payload is assembled by tests/helpers/mav.ts from invented values.
 * The layout it writes comes from the Kaitai specification; no value from a
 * real ticket appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isMav, parseMav } from '../src/lib/tickets/mav/mav.ts';
import { buildMav, mavSeconds } from './helpers/mav.ts';

describe('MÁV records', () => {
	it('reads the head, the header and the trip', () => {
		const c = parsePayload(buildMav());
		expect(c.kind).toBe('mav');
		if (c.kind !== 'mav') return;

		expect(c.ticket.version).toBe(5);
		expect(c.ticket.signingKeyId).toBe(1);
		expect(c.ticket.ticketNumber).toBe('5500000X000000000');
		expect(c.ticket.issuerRics).toBe(1155);
		expect(c.ticket.issuedAt).toBe('2024-06-01T08:00:00Z');
		expect(c.ticket.price).toBe(1500);
		expect(c.ticket.ticketMedium).toBe('Paper from a vending machine');

		expect(c.ticket.trip).not.toBeNull();
		expect(c.ticket.trip?.departureStation).toBe(5501016);
		expect(c.ticket.trip?.destinationStation).toBe(5510025);
		expect(c.ticket.trip?.travelClass).toBe('2');
		expect(c.ticket.trip?.departureTime).toBe('2024-06-02T09:30:00Z');
		expect(c.ticket.trip?.validityMinutes).toBe(240);
		expect(c.ticket.trip?.numPassengers).toBe(1);
	});

	it('counts its epoch from 2017 in Central European Time', () => {
		// the epoch is 2017-01-01T00:00:00+01:00, an hour before UTC midnight
		expect(mavSeconds('2016-12-31T23:00:00Z')).toBe(0);
		const t = parseMav(buildMav({ issuedAt: '2016-12-31T23:00:00Z' }));
		// a zero timestamp is an unset field rather than the epoch itself
		expect(t.issuedAt).toBeNull();

		expect(parseMav(buildMav({ issuedAt: '2017-01-01T00:00:00Z' })).issuedAt).toBe(
			'2017-01-01T00:00:00Z'
		);
	});

	it('moves the ticket number out of the compressed body at version 5', () => {
		// up to 4 it is inside the gzip block, from 5 it is in the plaintext head
		for (const version of [2, 3, 4, 5, 6]) {
			const t = parseMav(buildMav({ version, ticketNumber: '5512345X678901234' }));
			expect(t.version, `version ${version}`).toBe(version);
			expect(t.ticketNumber, `version ${version}`).toBe('5512345X678901234');
			expect(t.issuerRics, `version ${version}`).toBe(1155);
		}
	});

	it('reads validity as two bytes on the older versions and three on the newer', () => {
		// 65535 minutes is the most the two byte field can hold
		expect(parseMav(buildMav({ version: 3, trip: { validityMinutes: 65535 } })).trip?.validityMinutes).toBe(65535);
		expect(parseMav(buildMav({ version: 4, trip: { validityMinutes: 100000 } })).trip?.validityMinutes).toBe(100000);
	});

	it('changes station numbering at version 5, and says which is in use', () => {
		// up to 4 the ids are UIC codes the bundled table can name
		expect(parseMav(buildMav({ version: 4 })).stationNumbering).toBe('uic');
		// from 5 they are MÁV's own, for which no table is bundled
		expect(parseMav(buildMav({ version: 5 })).stationNumbering).toBe('mav');
	});

	it('reads the specimen flag, which is 1 for a real ticket', () => {
		expect(parseMav(buildMav({ trip: { production: 1 } })).specimen).toBe(false);
		expect(parseMav(buildMav({ trip: { production: 0 } })).specimen).toBe(true);
	});

	it('reads the named traveller when the flag says one is there', () => {
		expect(parseMav(buildMav()).person).toBeNull();

		const t = parseMav(
			buildMav({ person: { name: 'TEST TRAVELLER', birthDate: 19920803, idCard: 'ID123456' } })
		);
		expect(t.person?.name).toBe('TEST TRAVELLER');
		expect(t.person?.dateOfBirth).toBe('1992-08-03');
		expect(t.person?.idCardNumber).toBe('ID123456');
	});

	it('rejects a birth date that is not one, rather than inventing it', () => {
		expect(parseMav(buildMav({ person: { name: 'X', birthDate: 0, idCard: '' } })).person?.dateOfBirth).toBeNull();
		expect(
			parseMav(buildMav({ person: { name: 'X', birthDate: 19921399, idCard: '' } })).person
				?.dateOfBirth
		).toBeNull();
	});

	it('drops empty route slots rather than showing fifteen zeros', () => {
		const t = parseMav(buildMav({ trip: { via: [5501016, 5510025] } }));
		expect(t.trip?.via).toEqual([5501016, 5510025]);
		expect(t.trip?.viaReturn).toEqual([]);
	});

	it('reads reservation blocks, and the wider train number from version 6', () => {
		const t = parseMav(
			buildMav({ reservations: [{ trainNumber: '9999', coach: '12', seats: [45, 46] }] })
		);
		expect(t.reservations).toHaveLength(1);
		expect(t.reservations[0].trainNumber).toBe('9999');
		expect(t.reservations[0].coach).toBe('12');
		expect(t.reservations[0].seats).toEqual([45, 46]);
		expect(t.reservations[0].operatorRics).toBe(1155);

		const wide = parseMav(
			buildMav({ version: 6, reservations: [{ trainNumber: 'IC 999 SOMENAME' }] })
		);
		expect(wide.reservations[0].trainNumber).toBe('IC 999 SOMENAME');
	});

	it('ignores the signature that follows the compressed block', () => {
		// fflate's gunzip would read the uncompressed size out of the signature,
		// so the length must come from the deflate stream itself
		for (const signatureLength of [0, 56, 256]) {
			const t = parseMav(buildMav({ signatureLength }));
			expect(t.trip?.departureStation, `signature of ${signatureLength}`).toBe(5501016);
		}
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isMav(buildMav())).toBe(true);

		const good = buildMav();
		// a version outside the range the layout covers
		const badVersion = Uint8Array.from(good);
		badVersion[0] = 7;
		expect(isMav(badVersion)).toBe(false);

		// no gzip magic where the compressed body belongs
		const noGzip = Uint8Array.from(good);
		noGzip[24] = 0x00;
		expect(isMav(noGzip)).toBe(false);

		// the version 5 head carries a numeric issuer
		const badIssuer = Uint8Array.from(good);
		badIssuer[20] = 0x41;
		expect(isMav(badIssuer)).toBe(false);

		expect(isMav(new Uint8Array(20))).toBe(false);
		expect(isMav(new Uint8Array(0))).toBe(false);
	});

	it('does not swallow other formats', () => {
		expect(isMav(new TextEncoder().encode('#UT01' + 'x'.repeat(100)))).toBe(false);
		expect(isMav(new TextEncoder().encode('eRIV' + '0'.repeat(120)))).toBe(false);
	});
});
