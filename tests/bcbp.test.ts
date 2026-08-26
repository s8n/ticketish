// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * IATA Bar Coded Boarding Pass, format M.
 *
 * Every payload is assembled here from invented values by the builders below,
 * which write each of the record's three self describing lengths from the
 * field it actually counts. No value from a real boarding pass appears: the
 * airports are ones that do not exist, and the airline designator is one IATA
 * does not assign.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { isBcbp, parseBcbp } from '../src/lib/tickets/bcbp/bcbp.ts';
import {
	airlineLabel,
	airlineName,
	airportName,
	airportPlace,
	type AirportTable
} from '../src/lib/tickets/bcbp/codes.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** The record writes its own lengths as two ASCII hex digits. */
const size = (s: string) => s.length.toString(16).toUpperCase().padStart(2, '0');

interface LegParts {
	pnr: string;
	from: string;
	to: string;
	carrier: string;
	flight: string;
	day: string;
	compartment: string;
	seat: string;
	sequence: string;
	status: string;
}

const LEG: LegParts = {
	pnr: 'QQ11ZZ',
	from: 'AAA',
	to: 'ZZZ',
	carrier: 'QQ',
	flight: '0123',
	day: '200',
	compartment: 'Y',
	seat: '012C',
	sequence: '0044',
	status: '1'
};

/** Items 7 to 113, the 35 characters every leg carries before its length. */
function mandatory(parts: Partial<LegParts> = {}): string {
	const p = { ...LEG, ...parts };
	const s =
		p.pnr.padEnd(7) +
		p.from +
		p.to +
		p.carrier.padEnd(3) +
		p.flight.padEnd(5) +
		p.day +
		p.compartment +
		p.seat.padEnd(4) +
		p.sequence.padEnd(5) +
		p.status;
	expect(s.length).toBe(35);
	return s;
}

interface UniqueParts {
	version: string;
	passengerDescription: string;
	checkIn: string;
	issuance: string;
	dateOfIssue: string;
	documentType: string;
	issuer: string;
	bagTags: string[];
}

const UNIQUE: UniqueParts = {
	version: '6',
	passengerDescription: '0',
	checkIn: 'W',
	issuance: 'M',
	dateOfIssue: '6200',
	documentType: 'B',
	issuer: 'QQ',
	bagTags: []
};

/** Item 8 and 9, then item 10 over the items that describe the booking. */
function unique(parts: Partial<UniqueParts> = {}): string {
	const p = { ...UNIQUE, ...parts };
	const body =
		p.passengerDescription +
		p.checkIn +
		p.issuance +
		p.dateOfIssue +
		p.documentType +
		p.issuer.padEnd(3) +
		p.bagTags.join('');
	return `>${p.version}${size(body)}${body}`;
}

interface RepeatedParts {
	numericCode: string;
	serial: string;
	selectee: string;
	documentCheck: string;
	marketing: string;
	ffAirline: string;
	ffNumber: string;
	idAd: string;
	baggage: string;
	fastTrack: string;
}

const REPEATED: RepeatedParts = {
	numericCode: '999',
	serial: '1122334455',
	selectee: '0',
	documentCheck: '1',
	marketing: 'QQ',
	ffAirline: 'QQ',
	ffNumber: 'QQ7654321',
	idAd: '0',
	baggage: '23K',
	fastTrack: 'Y'
};

/** Item 17 over the items that describe one leg. */
function repeated(parts: Partial<RepeatedParts> = {}, truncateTo?: number): string {
	const p = { ...REPEATED, ...parts };
	let body =
		p.numericCode +
		p.serial +
		p.selectee +
		p.documentCheck +
		p.marketing.padEnd(3) +
		p.ffAirline.padEnd(3) +
		p.ffNumber.padEnd(16) +
		p.idAd +
		p.baggage.padEnd(3) +
		p.fastTrack;
	// Issuers are free to stop once the rest of the items are blank.
	if (truncateTo !== undefined) body = body.slice(0, truncateTo);
	return `${size(body)}${body}`;
}

/** One leg: the mandatory items, then item 6 over everything after it. */
function leg(parts: Partial<LegParts> = {}, conditional = ''): string {
	return mandatory(parts) + size(conditional) + conditional;
}

function pass(name: string, eticket: string, ...legs: string[]): Uint8Array {
	return ascii(`M${legs.length}${name.padEnd(20)}${eticket}${legs.join('')}`);
}

/** One leg with everything filled in, which is what most assertions read. */
const full = (parts: Partial<LegParts> = {}, u: Partial<UniqueParts> = {}) =>
	pass('TESTER/SAMPLE MS', 'E', leg(parts, unique(u) + repeated()));

/** Day 200 of 2026, so a pass issued on day 200 needs no year guessed. */
const NOW = new Date('2026-07-19T12:00:00Z');

describe('BCBP boarding passes', () => {
	it('reads the fields the boarding pass also prints', () => {
		const c = parsePayload(full());
		expect(c.kind).toBe('bcbp');
		if (c.kind !== 'bcbp') return;

		expect(c.ticket.version).toBe(6);
		expect(c.ticket.legCount).toBe(1);
		expect(c.ticket.passengerName).toBe('TESTER/SAMPLE MS');
		expect(c.ticket.surname).toBe('TESTER');
		expect(c.ticket.givenName).toBe('SAMPLE MS');
		expect(c.ticket.electronicTicket).toBe(true);
		expect(c.ticket.issuerDesignator).toBe('QQ');
		expect(c.ticket.documentTypeLabel).toBe('Boarding pass');

		const l = c.ticket.legs[0];
		expect(l.pnr).toBe('QQ11ZZ');
		expect(l.fromAirport).toBe('AAA');
		expect(l.toAirport).toBe('ZZZ');
		expect(l.operatingCarrier).toBe('QQ');
		expect(l.dayOfFlight).toBe(200);
		expect(l.compartmentLabel).toBe('Economy');
		expect(l.passengerStatusLabel).toBe('Checked in');
		expect(l.airlineNumericCode).toBe('999');
		expect(l.documentSerial).toBe('1122334455');
		expect(l.frequentFlyerNumber).toBe('QQ7654321');
		expect(l.freeBaggageAllowance).toBe('23K');
		expect(l.fastTrack).toBe(true);
	});

	it('drops the padding the record uses for its numeric fields', () => {
		const l = parseBcbp(full(), NOW).legs[0];
		// 0123, 012C and 0044 as issued: the leading zeros are the field width
		expect(l.flightNumber).toBe('123');
		expect(l.seat).toBe('12C');
		expect(l.sequence).toBe('44');
	});

	it('reads an unassigned seat and sequence as absent rather than as zero', () => {
		const l = parseBcbp(full({ seat: '000', sequence: '0000' }), NOW).legs[0];
		expect(l.seat).toBeNull();
		expect(l.sequence).toBeNull();
	});

	it('dates a flight from the issuing date, which is all the year there is', () => {
		// item 22 is 6200: day 200 of a year ending in 6, which is 2026 here
		expect(parseBcbp(full(), NOW).issueDate).toBe('2026-07-19');
		expect(parseBcbp(full(), NOW).legs[0].flightDate).toBe('2026-07-19');
		expect(parseBcbp(full(), NOW).yearFrom).toBe('issue');
	});

	it('rolls a flight earlier in the year than its issue into the next one', () => {
		// nothing is issued after the flight it is for, so day 10 is January next
		const t = parseBcbp(full({ day: '010' }), NOW);
		expect(t.legs[0].flightDate).toBe('2027-01-10');
	});

	it('takes the nearest year when the pass does not say when it was issued', () => {
		const t = parseBcbp(full({ day: '010' }, { dateOfIssue: '    ' }), NOW);
		expect(t.issueDate).toBeNull();
		expect(t.yearFrom).toBe('today');
		// day 10 of 2027 is nearer 19 July 2026 than day 10 of 2026 is
		expect(t.legs[0].flightDate).toBe('2027-01-10');
	});

	it('reads a pass with several legs, whose booking items ride on the first', () => {
		const data = pass(
			'TESTER/SAMPLE MS',
			'E',
			leg({ from: 'AAA', to: 'BBB', flight: '0001' }, unique() + repeated()),
			leg({ from: 'BBB', to: 'CCC', flight: '0002', day: '201' }, repeated({ baggage: '2PC' })),
			leg({ from: 'CCC', to: 'ZZZ', flight: '0003', day: '201' }, repeated({ baggage: '2PC' }))
		);
		const t = parseBcbp(data, NOW);

		expect(t.legCount).toBe(3);
		expect(t.legs.map((l) => `${l.fromAirport}${l.toAirport}`)).toEqual([
			'AAABBB',
			'BBBCCC',
			'CCCZZZ'
		]);
		expect(t.legs.map((l) => l.flightNumber)).toEqual(['1', '2', '3']);
		expect(t.legs.map((l) => l.freeBaggageAllowance)).toEqual(['23K', '2PC', '2PC']);
		// the booking items appear once, on the first leg, and cover all of them
		expect(t.issuerDesignator).toBe('QQ');
		expect(t.legs.map((l) => l.flightDate)).toEqual(['2026-07-19', '2026-07-20', '2026-07-20']);
	});

	it('reads a leg that declares no conditional data at all', () => {
		const t = parseBcbp(pass('TESTER/SAMPLE MS', 'E', leg()), NOW);
		expect(t.legs[0].pnr).toBe('QQ11ZZ');
		expect(t.legs[0].airlineNumericCode).toBeNull();
		expect(t.version).toBeNull();
	});

	it('keeps what an issuer padded past the last field it accounted for', () => {
		// a leg that declares nothing, then six spaces and a letter after it
		const t = parseBcbp(ascii(new TextDecoder().decode(pass('A/B', 'E', leg())) + '      K'), NOW);
		expect(t.legs[0].pnr).toBe('QQ11ZZ');
		expect(t.trailing).toBe('K');
	});

	it('reads a leg whose issuer stopped writing part way through the items', () => {
		// item 17 counts as far as the selectee indicator and no further
		const t = parseBcbp(pass('A/B', 'E', leg({}, unique() + repeated({}, 15))), NOW);
		expect(t.legs[0].documentSerial).toBe('1122334455');
		expect(t.legs[0].fastTrack).toBeNull();
		expect(t.legs[0].freeBaggageAllowance).toBeNull();
	});

	it('reads the baggage tags as the series of consecutive tags they are', () => {
		const t = parseBcbp(full({}, { bagTags: ['0999123456003', '0'.repeat(13)] }), NOW);
		expect(t.bagTags).toEqual([
			{
				leadingDigit: '0',
				carrierNumericCode: '999',
				initialTagNumber: '123456',
				count: 3,
				raw: '0999123456003'
			}
		]);
	});

	it('reads the signature some administrations require, and the record before it', () => {
		const signature = '0123456789ABCDEF';
		const body = new TextDecoder().decode(full());
		const t = parseBcbp(ascii(`${body}^1${size(signature)}${signature}`), NOW);
		expect(t.legs[0].pnr).toBe('QQ11ZZ');
		expect(t.security).toEqual({ type: '1', data: signature });
	});

	it('names the codes version 3 defines', () => {
		const l = parseBcbp(full(), NOW).legs[0];
		expect(l.selecteeLabel).toBe('Not a selectee');
		expect(l.documentVerificationLabel).toBe('Required');
		expect(l.idAdIndicatorLabel).toBe('IDN1, positive space');
	});

	it('leaves the selectee value the guide hands to the TSA unlabelled', () => {
		// version 3 defines 0 and 1; the seventh edition adds a 3 and does not
		expect(parseBcbp(full(), NOW).legs[0].selectee).toBe('0');
		const three = parseBcbp(
			pass('A/B', 'E', leg({}, unique() + repeated({ selectee: '3' }))),
			NOW
		).legs[0];
		expect(three.selectee).toBe('3');
		expect(three.selecteeLabel).toBeNull();
	});

	it('reads the gender codes version 8 added to the passenger description', () => {
		for (const [code, label] of [
			['0', 'Adult'],
			['2', 'Female'],
			['X', 'Unspecified'],
			['U', 'Undisclosed']
		]) {
			const t = parseBcbp(full({}, { passengerDescription: code }), NOW);
			expect(t.passengerDescriptionLabel).toBe(label);
		}
	});

	it('keeps the two check-in source lists apart, since only one has a kiosk X', () => {
		// item 14 can say transfer kiosk; item 12 has no such value
		const t = parseBcbp(full({}, { checkIn: 'X', issuance: 'X' }), NOW);
		expect(t.sourceOfCheckIn).toBe('X');
		expect(t.sourceOfCheckInLabel).toBeNull();
		expect(t.sourceOfIssuanceLabel).toBe('Transfer kiosk');
	});

	it('spells a baggage allowance out, and leaves an unrecognised one alone', () => {
		const allowance = (v: string) =>
			parseBcbp(pass('A/B', 'E', leg({}, unique() + repeated({ baggage: v }))), NOW).legs[0];
		expect(allowance('23K').freeBaggageAllowanceLabel).toBe('23 kg');
		expect(allowance('2PC').freeBaggageAllowanceLabel).toBe('2 pieces');
		expect(allowance('1PC').freeBaggageAllowanceLabel).toBe('1 piece');
		expect(allowance('50L').freeBaggageAllowanceLabel).toBe('50 lb');
		// nothing in Resolution 722's shape, so it stays as the issuer wrote it
		expect(allowance('NIL').freeBaggageAllowanceLabel).toBe('NIL');
	});

	it('names the cabins Resolution 728 designates', () => {
		for (const [code, label] of [
			['F', 'First'],
			['J', 'Business (premium)'],
			['C', 'Business'],
			['W', 'Premium economy'],
			['Y', 'Economy'],
			['Q', 'Economy (discounted)']
		]) {
			const l = parseBcbp(full({ compartment: code }), NOW).legs[0];
			expect(l.compartment).toBe(code);
			expect(l.compartmentLabel).toBe(label);
		}
	});

	it('shows an unlisted cabin code as issued rather than dropping it', () => {
		expect(parseBcbp(full({ compartment: '5' }), NOW).legs[0].compartmentLabel).toBeNull();
		expect(parseBcbp(full({ compartment: '5' }), NOW).legs[0].compartment).toBe('5');
	});

	it('reads an itinerary receipt as one, since only item 16 says so', () => {
		const t = parseBcbp(full({ seat: '000', sequence: '0000', status: '0' }, { documentType: 'I' }), NOW);
		expect(t.documentTypeLabel).toBe('Itinerary receipt');
		expect(t.legs[0].passengerStatusLabel).toBe('Ticket issued, not checked in');
	});

	it('reads a blank electronic ticket indicator as unset, not as ticketless', () => {
		expect(parseBcbp(full(), NOW).electronicTicket).toBe(true);
		const blank = parseBcbp(pass('A/B', ' ', leg({}, unique() + repeated())), NOW);
		expect(blank.electronicTicket).toBeNull();
	});

	it('rejects payloads that do not match the layout', () => {
		expect(isBcbp(full())).toBe(true);

		const body = new TextDecoder().decode(full());
		const swap = (at: number, s: string) =>
			ascii(body.slice(0, at) + s + body.slice(at + s.length));

		expect(isBcbp(swap(0, 'S'))).toBe(false); // format S was dropped in 2007
		expect(isBcbp(swap(1, '0'))).toBe(false); // a pass has at least one leg
		expect(isBcbp(swap(1, '5'))).toBe(false); // and version 3 caps it at four
		expect(isBcbp(swap(30, 'aaa'))).toBe(false); // airport codes are upper case
		expect(isBcbp(swap(33, '123'))).toBe(false); // and are letters
		expect(isBcbp(swap(44, '400'))).toBe(false); // no year has a day 400
		expect(isBcbp(swap(44, '000'))).toBe(false); // or a day 0
		expect(isBcbp(swap(58, 'ZZ'))).toBe(false); // item 6 is written in hex
		expect(isBcbp(ascii(body.slice(0, 59)))).toBe(false); // truncated inside a leg
		expect(isBcbp(new Uint8Array(120))).toBe(false); // not printable ASCII
	});

	it('does not swallow the other fixed-width ASCII formats', () => {
		// VIA Rail opens with a 13 digit ticket number
		expect(isBcbp(ascii('1234567890123'.padEnd(124, ' ')))).toBe(false);
		expect(isBcbp(ascii('eRIV'.padEnd(85, '0')))).toBe(false);
		expect(isBcbp(ascii(['TCDD_B', '6', '3', '0'].join('$').padEnd(80, '$')))).toBe(false);
	});
});

describe('naming the codes a boarding pass is written in', () => {
	it('names an airport and keeps the code as the fallback', () => {
		const airports = { LHR: ['London Heathrow', 'London', 'GB'] } satisfies AirportTable;
		expect(airportName(airports, 'LHR')).toBe('London Heathrow');
		expect(airportPlace(airports, 'LHR')).toBe('London, United Kingdom');
		// a metropolitan area code is not an airport and is in no catalogue
		expect(airportName(airports, 'LON')).toBe('LON');
		expect(airportPlace(airports, 'LON')).toBeNull();
		// and until the table loads there is nothing but the code
		expect(airportName(null, 'LHR')).toBe('LHR');
	});

	it('copes with an airport the catalogue gives no town or country', () => {
		const airports = { ZZZ: ['Somewhere'] } satisfies AirportTable;
		expect(airportName(airports, 'ZZZ')).toBe('Somewhere');
		expect(airportPlace(airports, 'ZZZ')).toBeNull();
	});

	it('names an airline, and answers for the designators two of them share', () => {
		const airlines = { BA: 'British Airways' };
		expect(airlineName(airlines, 'BA')).toBe('British Airways');
		expect(airlineLabel(airlines, 'BA')).toBe('British Airways');
		// the build script leaves LH out, since Lufthansa Cargo holds it too
		expect(airlines).not.toHaveProperty('LH');
		expect(airlineName(airlines, 'LH')).toBe('Lufthansa');
		expect(airlineName(airlines, 'SQ')).toBe('Singapore Airlines');
	});

	it('shows a designator it cannot name as the designator', () => {
		expect(airlineName({}, 'QQ')).toBeNull();
		expect(airlineLabel({}, 'QQ')).toBe('QQ');
		expect(airlineName(null, 'BA')).toBeNull();
		expect(airlineName({ BA: 'British Airways' }, null)).toBeNull();
	});
});
