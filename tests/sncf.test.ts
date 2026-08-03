/**
 * The two SNCF formats: the reservation record (eRIV, eRIZ, eEDV) and the
 * e-billet (i0CV).
 *
 * Every payload here is assembled from invented values by the `build` helpers
 * below. The field offsets they use were established from real tickets, but no
 * value from a real ticket appears in this file.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isSncfReservation, parseSncfReservation } from '../src/lib/tickets/sncf/reservation.ts';
import { isSncfETicket, parseSncfETicket } from '../src/lib/tickets/sncf/eticket.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

interface Parts {
	magic?: string;
	pnr?: string;
	ticketNumber?: string;
	blockA?: string;
	blockB?: string;
	blockC?: string;
	origin?: string;
	destination?: string;
	train?: string;
	blockD?: string;
	coach?: string;
	seat?: string;
	travelClass?: string;
	tariff?: string;
	service?: string;
	authenticator?: string;
	/** Total length; the real records are 120, 121 or 165 characters. */
	length?: number;
}

/** Lay the fixed-width record out field by field, then pad to length. */
function build(parts: Parts = {}): Uint8Array {
	const p = {
		magic: 'eRIV',
		pnr: 'TESTPN',
		ticketNumber: '123456789',
		blockA: '0011',
		blockB: '000000000000',
		blockC: '00000000000000',
		origin: 'FRAAA',
		destination: 'GBZZZ',
		train: '09999',
		blockD: '00000000',
		coach: '03',
		seat: '007',
		travelClass: '2',
		tariff: 'XX99',
		service: 'QQ',
		authenticator: '',
		length: 121,
		...parts
	};

	const s =
		p.magic + // 0
		p.pnr + // 4
		p.ticketNumber + // 10
		p.blockA + // 19
		p.blockB + // 23
		p.blockC + // 35
		p.origin + // 49
		p.destination + // 54
		p.train + // 59
		' ' + // 64, always blank on the samples
		p.blockD + // 65
		p.coach + // 73
		p.seat + // 75
		p.travelClass + // 78
		p.tariff + // 79
		p.service + // 83
		p.authenticator; // 85

	expect(s.length).toBeLessThanOrEqual(p.length);
	return ascii(s.padEnd(p.length, ' '));
}

describe('SNCF / Eurostar reservation records', () => {
	it('reads the fields that the printed ticket also shows', () => {
		const c = parsePayload(build());
		expect(c.kind).toBe('sncf-reservation');
		if (c.kind !== 'sncf-reservation') return;

		expect(c.ticket.documentType).toBe('RIV');
		expect(c.ticket.pnr).toBe('TESTPN');
		expect(c.ticket.ticketNumber).toBe('123456789');
		expect(c.ticket.originCode).toBe('FRAAA');
		expect(c.ticket.destinationCode).toBe('GBZZZ');
		expect(c.ticket.trainNumber).toBe('9999');
		expect(c.ticket.coach).toBe('3');
		expect(c.ticket.seat).toBe('7');
		expect(c.ticket.travelClass).toBe('2');
		expect(c.ticket.tariffCode).toBe('XX99');
		expect(c.ticket.serviceCode).toBe('QQ');
	});

	it('exposes the last two magic letters as the printed number prefix', () => {
		// tickets print the number as "IV<number>", "IZ<number>", "DV<number>"
		for (const [magic, prefix] of [
			['eRIV', 'IV'],
			['eRIZ', 'IZ'],
			['eEDV', 'DV']
		]) {
			const t = parseSncfReservation(build({ magic }));
			expect(t.documentType).toBe(magic.slice(1));
			expect(t.numberPrefix).toBe(prefix);
		}
	});

	it('keeps a fare letter in the class field rather than mapping it', () => {
		expect(parseSncfReservation(build({ travelClass: 'H' })).travelClass).toBe('H');
		expect(parseSncfReservation(build({ travelClass: '1' })).travelClass).toBe('1');
	});

	it('reads the SNCF card stock layout at the same offsets', () => {
		const t = parseSncfReservation(
			build({
				magic: 'eEDV',
				origin: 'FRBBB',
				destination: 'FRCCC',
				train: '06666',
				coach: '16',
				seat: '047',
				tariff: 'PR11',
				length: 121
			})
		);
		expect(t.originCode).toBe('FRBBB');
		expect(t.destinationCode).toBe('FRCCC');
		expect(t.trainNumber).toBe('6666');
		expect(t.coach).toBe('16');
		expect(t.seat).toBe('47');
		expect(t.tariffCode).toBe('PR11');
	});

	it('picks up the trailing block only on the long form', () => {
		const blob = 'ABCDEFGHIJ'.repeat(4) + 'ABCDE';
		expect(blob.length).toBe(45);

		const long = parseSncfReservation(build({ authenticator: blob, length: 165 }));
		expect(long.authenticator).toBe(blob);

		// the 120 and 121 character forms pad with spaces instead
		expect(parseSncfReservation(build({ length: 121 })).authenticator).toBeNull();
		expect(parseSncfReservation(build({ length: 120 })).authenticator).toBeNull();
	});

	it('drops blank and all-zero blocks from extraFields', () => {
		expect(parseSncfReservation(build()).extraFields).toEqual(['0011']);

		const filled = parseSncfReservation(
			build({ blockA: '0000', blockB: '1234ABCDEFGH', blockD: '99887766' })
		);
		expect(filled.extraFields).toEqual(['1234ABCDEFGH', '99887766']);
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isSncfReservation(build())).toBe(true);

		// wrong magic
		expect(isSncfReservation(build({ magic: 'xRIV' }))).toBe(false);
		// letters where the ticket number belongs
		expect(isSncfReservation(build({ ticketNumber: 'ABCDEFGHI' }))).toBe(false);
		// digits where the station mnemonics belong
		expect(isSncfReservation(build({ origin: '12345' }))).toBe(false);
		// letters where the train number belongs
		expect(isSncfReservation(build({ train: 'ABCDE' }))).toBe(false);
		// truncated before the service code
		expect(isSncfReservation(ascii(new TextDecoder().decode(build()).slice(0, 84)))).toBe(false);
		// not printable ASCII
		expect(isSncfReservation(new Uint8Array(120))).toBe(false);
	});

	it('does not swallow other printable-ASCII formats', () => {
		const tcdd = ascii(['TCDD_B', '6', '3', '0'].join('$').padEnd(120, '$'));
		expect(isSncfReservation(tcdd)).toBe(false);
	});
});

interface EParts {
	magic?: string;
	pnr?: string;
	ticketNumber?: string;
	blockA?: string;
	dob?: string;
	origin?: string;
	destination?: string;
	train?: string;
	travelDate?: string;
	customerReference?: string;
	surname?: string;
	forename?: string;
	travelClass?: string;
	tariff?: string;
	returnBlock?: string;
}

/** Lay out the 131 character e-billet record field by field. */
function buildE(parts: EParts = {}): Uint8Array {
	const p = {
		magic: 'i0CV',
		pnr: 'TESTPN',
		ticketNumber: '123456789',
		blockA: '0011',
		dob: '01/02/1970',
		origin: 'FRAAA',
		destination: 'FRZZZ',
		train: '09999',
		travelDate: '26/04',
		customerReference: '0011122233344455566',
		surname: 'TESTSURNAME',
		forename: 'TESTFORENAME',
		travelClass: '2',
		tariff: 'XX99',
		returnBlock: '0'.repeat(16),
		...parts
	};

	const s =
		p.magic + // 0
		p.pnr + // 4
		p.ticketNumber + // 10
		p.blockA + // 19
		p.dob + // 23
		p.origin + // 33
		p.destination + // 38
		p.train + // 43
		p.travelDate + // 48
		p.customerReference + // 53, 19 characters
		p.surname.padStart(19, ' ') + // 72, right aligned in 19
		p.forename.padStart(19, ' ') + // 91, right aligned in 19
		p.travelClass + // 110
		p.tariff + // 111
		p.returnBlock; // 115, 16 characters

	expect(s.length).toBe(131);
	return ascii(s);
}

describe('SNCF e-billet records', () => {
	it('reads the fields that the printed ticket also shows', () => {
		const c = parsePayload(buildE());
		expect(c.kind).toBe('sncf-eticket');
		if (c.kind !== 'sncf-eticket') return;

		expect(c.ticket.pnr).toBe('TESTPN');
		expect(c.ticket.ticketNumber).toBe('123456789');
		expect(c.ticket.customerReference).toBe('0011122233344455566');
		expect(c.ticket.surname).toBe('TESTSURNAME');
		expect(c.ticket.forename).toBe('TESTFORENAME');
		expect(c.ticket.originCode).toBe('FRAAA');
		expect(c.ticket.destinationCode).toBe('FRZZZ');
		expect(c.ticket.trainNumber).toBe('9999');
		expect(c.ticket.travelClass).toBe('2');
		expect(c.ticket.tariffCode).toBe('XX99');
	});

	it('reads the travel date as day then month, with no year in the record', () => {
		// the day comes first, so this is 26 April rather than any month 26
		expect(parseSncfETicket(buildE({ travelDate: '26/04' })).travelDate).toEqual({
			day: 26,
			month: 4
		});
		expect(parseSncfETicket(buildE({ travelDate: '06/09' })).travelDate).toEqual({
			day: 6,
			month: 9
		});
		// an unset field is not a date
		expect(parseSncfETicket(buildE({ travelDate: '00/00' })).travelDate).toBeNull();
		expect(parseSncfETicket(buildE({ travelDate: '99/99' })).travelDate).toBeNull();
	});

	it('reads the date of birth as an ISO date and rejects impossible ones', () => {
		expect(parseSncfETicket(buildE({ dob: '01/02/1970' })).dateOfBirth).toBe('1970-02-01');
		expect(parseSncfETicket(buildE({ dob: '31/02/1970' })).dateOfBirth).toBeNull();
		expect(parseSncfETicket(buildE({ dob: '0000000000' })).dateOfBirth).toBeNull();
	});

	it('trims the right-aligned name fields', () => {
		const t = parseSncfETicket(buildE({ surname: 'AA', forename: 'BB' }));
		expect(t.surname).toBe('AA');
		expect(t.forename).toBe('BB');
	});

	it('leaves the return leg null unless the block carries something', () => {
		expect(parseSncfETicket(buildE()).returnLeg).toBeNull();
		expect(parseSncfETicket(buildE({ returnBlock: ' '.repeat(16) })).returnLeg).toBeNull();

		const t = parseSncfETicket(buildE({ returnBlock: '1FRZZZFRAAA08888' }));
		expect(t.returnLeg).toEqual({
			travelClass: '1',
			originCode: 'FRZZZ',
			destinationCode: 'FRAAA',
			trainNumber: '8888'
		});
	});

	it('drops an all-zero block from extraFields', () => {
		expect(parseSncfETicket(buildE({ blockA: '0011' })).extraFields).toEqual(['0011']);
		expect(parseSncfETicket(buildE({ blockA: '0000' })).extraFields).toEqual([]);
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isSncfETicket(buildE())).toBe(true);

		// wrong magic
		expect(isSncfETicket(buildE({ magic: 'i0CX' }))).toBe(false);
		// the record is a fixed 131 characters
		expect(isSncfETicket(ascii('i0CV'.padEnd(130, '0')))).toBe(false);
		expect(isSncfETicket(ascii('i0CV'.padEnd(132, '0')))).toBe(false);
		// not printable ASCII
		expect(isSncfETicket(new Uint8Array(131))).toBe(false);
	});

	it('is kept apart from the reservation record', () => {
		// the two SNCF formats share neither magic nor length
		expect(isSncfReservation(buildE())).toBe(false);
		expect(isSncfETicket(build())).toBe(false);
		expect(parsePayload(build()).kind).toBe('sncf-reservation');
		expect(parsePayload(buildE()).kind).toBe('sncf-eticket');
	});
});
