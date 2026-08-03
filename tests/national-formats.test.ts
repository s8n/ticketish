/**
 * TCDD, SSB1 (as used by VR) and Trenitalia. All payloads are built by the
 * test; the field layouts they exercise were established from real tickets
 * but no real ticket data appears here.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import { loadTcddStations, tcddStationName } from '../src/lib/tickets/tcdd/stations.ts';
import { parseSsb1 } from '../src/lib/tickets/ssb/ssb1.ts';
import { parseTrenitalia } from '../src/lib/tickets/trenitalia/trenitalia.ts';
import { BitWriter } from './helpers/build.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('TCDD tickets', () => {
	// Older layout: magic first, then a version digit.
	const classic = [
		'TCDD_B', '6', '3', '0',
		'240010TESTTKT1', 'TESTPNR01', '20240519103000',
		'11111111111', '49549', '1', '2',
		'12345-19052024', '111111111', '222222222', '99999999999',
		'7', '12b', '1', '150.00', '200.00', '20240501121500',
		'null', 'null', '0', '', '250', 'a'.repeat(40)
	];

	// Newer layout: opens with the separator, then the magic and a product
	// name where the older one has a version digit.
	const modern = [
		'', 'TCDD_B', 'tcddprod',
		'T24TESTPNR000000000001', '24TESTPN', '20240519000000',
		'40000', 'AH', '2', '54321-19052024',
		// station ids in the current backend's numbering
		'5', '345', '2', '6', '21', '999.0', '20240501153142',
		'190000', '60', 'b'.repeat(40)
	];

	it('parses the older layout', () => {
		const c = parsePayload(ascii(classic.join('$')));
		expect(c.kind).toBe('tcdd');
		if (c.kind !== 'tcdd') return;
		expect(c.ticket.variant).toBe('classic');
		expect(c.ticket.ticketNumber).toBe('240010TESTTKT1');
		expect(c.ticket.pnr).toBe('TESTPNR01');
		expect(c.ticket.departure).toBe('2024-05-19T10:30');
		expect(c.ticket.purchased).toBe('2024-05-01T12:15');
		expect(c.ticket.trainNumber).toBe('12345');
		expect(c.ticket.originCode).toBe('111111111');
		expect(c.ticket.destinationCode).toBe('222222222');
		expect(c.ticket.coach).toBe('7');
		expect(c.ticket.seat).toBe('12b');
		expect(c.ticket.price).toBe('150.00');
		expect(c.ticket.fullPrice).toBe('200.00');
		expect(c.ticket.checksum).toMatch(/^[0-9a-f]{40}$/);
	});

	it('parses the newer layout, which starts with a separator', () => {
		const payload = ascii(modern.join('$'));
		// the magic is no longer the first thing in the record
		expect(new TextDecoder().decode(payload).startsWith('$')).toBe(true);
		const c = parsePayload(payload);
		expect(c.kind).toBe('tcdd');
		if (c.kind !== 'tcdd') return;
		expect(c.ticket.variant).toBe('tcddprod');
		expect(c.ticket.ticketNumber).toBe('T24TESTPNR000000000001');
		expect(c.ticket.pnr).toBe('24TESTPN');
		expect(c.ticket.trainNumber).toBe('54321');
		expect(c.ticket.originCode).toBe('5');
		expect(c.ticket.destinationCode).toBe('345');
		expect(c.ticket.seat).toBe('21');
		expect(c.ticket.price).toBe('999.0');
		expect(c.ticket.purchased).toBe('2024-05-01T15:31');
		expect(c.ticket.checksum).toMatch(/^[0-9a-f]{40}$/);
	});

	it('drops a zeroed departure time rather than claiming midnight', () => {
		const c = parsePayload(ascii(modern.join('$')));
		if (c.kind !== 'tcdd') return;
		expect(c.ticket.departure).toBe('2024-05-19');
	});

	it('leaves fields it cannot place in the newer layout unclaimed', () => {
		const c = parsePayload(ascii(modern.join('$')));
		if (c.kind !== 'tcdd') return;
		// no field in this layout matches the printed car
		expect(c.ticket.coach).toBe('');
		expect(c.ticket.extraFields).toContain('tcddprod');
		expect(c.ticket.extraFields).toContain('AH');
		// claimed fields are not repeated among the unplaced ones
		expect(c.ticket.extraFields).not.toContain('5');
		expect(c.ticket.extraFields).not.toContain('345');
	});

	it('names the stations of the newer layout from the built-in table', async () => {
		const names = await loadTcddStations();
		const c = parsePayload(ascii(modern.join('$')));
		if (c.kind !== 'tcdd') return;
		expect(tcddStationName(names, c.ticket.originCode)).toBe('ARİFİYE');
		expect(tcddStationName(names, c.ticket.destinationCode)).toBe('KIRKAĞAÇ');
	});

	it('falls back to the raw id for stations it does not know', async () => {
		const names = await loadTcddStations();
		// the older layout numbers stations in a retired 9 digit space
		expect(tcddStationName(names, '999999999')).toBe('Station 999999999');
		expect(tcddStationName(names, '')).toBe('');
		expect(tcddStationName(null, '5')).toBe('Station 5');
	});

	it('rejects a truncated record', () => {
		expect(parsePayload(ascii('TCDD_B$6$3$0$X')).kind).not.toBe('tcdd');
		expect(parsePayload(ascii('$TCDD_B$tcddprod$X')).kind).not.toBe('tcdd');
	});
});

describe('VR tickets (SSB1)', () => {
	/** 107 bytes, bit-packed, with no separate signature block. */
	function ssb1({
		rics = 10,
		adults = 1,
		children = 0,
		validFromDay = 106,
		validUntilDay = 106,
		departureStation = 'AAA',
		arrivalStation = 'BBB',
		departureSlot = 29,
		train = 42,
		reservation = 100000000001,
		travelClass = '2',
		coach = 2,
		seatNumber = 24,
		pnr = '000006'
	} = {}) {
		const w = new BitWriter();
		w.int(2, 4).int(rics, 14);
		w.bool(false); // return included
		w.int(0, 6); // number of tickets
		w.int(adults, 7).int(children, 7);
		w.int(validFromDay, 9).int(validUntilDay, 9);
		w.bool(true); // individual frequent traveller id follows
		w.int(0, 47);
		w.bool(false); // departure station is a name, not a number
		w.strAlpha(departureStation, 5); // bits 106..136
		w.bool(false);
		w.strAlpha(arrivalStation, 5); // bits 137..167
		w.int(departureSlot, 6);
		w.int(train, 17);
		// reservation reference is 40 bits, beyond a safe integer shift
		const reservationBits = reservation.toString(2).padStart(40, '0');
		for (const bit of reservationBits) w.int(Number(bit), 1);
		w.strAlpha(travelClass, 1);
		w.int(coach, 10);
		w.int(seatNumber, 7);
		w.strAlpha('', 1);
		w.bool(false); // overbooked
		w.strAlpha(pnr, 7); // bits 260..302
		w.int(0, 4); // ticket type
		w.bool(true); // not a specimen
		return w.padTo(107 * 8).bytes(107);
	}

	const REFERENCE = new Date('2026-05-01T00:00:00Z');

	it('reads the journey', () => {
		const t = parseSsb1(ssb1(), REFERENCE);
		expect(t.version).toBe(2);
		expect(t.issuerRics).toBe(10);
		expect(t.departureStation).toBe('AAA');
		expect(t.arrivalStation).toBe('BBB');
		expect(t.departureTime).toBe('14:00');
		expect(t.trainNumber).toBe(42);
		expect(t.coachNumber).toBe(2);
		expect(t.seat).toBe('24');
		expect(t.numAdults).toBe(1);
		expect(t.travelClass).toBe('2');
		expect(t.specimen).toBe(false);
	});

	it('resolves a day of the year that carries no year at all', () => {
		// day 106 of 2026 is 16 April; the year comes from the reference date
		const t = parseSsb1(ssb1({ validFromDay: 106, validUntilDay: 107 }), REFERENCE);
		expect(t.validFrom).toBe('2026-04-16');
		expect(t.validUntil).toBe('2026-04-17');
	});

	it('is reached through the format dispatcher', () => {
		expect(parsePayload(ssb1()).kind).toBe('ssb1');
	});
});

describe('Trenitalia tickets', () => {
	/** 67 bytes: an SSB style header over a body of its own design. */
	function trenitalia({
		dayOfYear = 198,
		train = 1234,
		coach = 8,
		seatNumber = 4,
		seatLetter = 'D',
		pnr = 'ABCDEF',
		entitlement = 1234567890
	} = {}) {
		const w = new BitWriter();
		w.int(2, 4).int(83, 14).int(0, 4).int(16, 5); // version, RICS, key id, type 16
		w.padTo(43).int(dayOfYear, 9); // bits 43..52
		w.padTo(177).int(train, 17); // bits 177..194
		w.padTo(246).int(coach, 4); // bits 246..250
		w.padTo(251).int(seatNumber, 6); // bits 251..257, one spare bit before it
		w.strAlpha(seatLetter, 1); // bits 257..263
		w.padTo(270).strAlpha(pnr, 6); // bits 270..306
		w.padTo(468);
		// the entitlement number is 32 bits, so write it in two halves
		w.int(Math.floor(entitlement / 0x10000), 16).int(entitlement % 0x10000, 16);
		return w.padTo(67 * 8).bytes(67);
	}

	const REFERENCE = new Date('2026-07-20T00:00:00Z');

	it('reads the fields that were confirmed against printed tickets', () => {
		const t = parseTrenitalia(trenitalia(), REFERENCE);
		expect(t.issuerRics).toBe(83);
		expect(t.ticketType).toBe(16);
		expect(t.dayOfYear).toBe(198);
		expect(t.departureDate).toBe('2026-07-17');
		expect(t.trainNumber).toBe(1234);
		expect(t.coach).toBe(8);
		expect(t.seat).toBe('4D');
		expect(t.pnr).toBe('ABCDEF');
		expect(t.entitlementNumber).toBe(1234567890);
	});

	it('stores the seat number as an integer, not as digits', () => {
		// seat 21D is one 6 bit value plus a letter, which a character based
		// reading would render as "LD"
		const t = parseTrenitalia(trenitalia({ seatNumber: 21, seatLetter: 'D' }), REFERENCE);
		expect(t.seat).toBe('21D');
	});

	it('leaves reservation fields empty on a regional ticket', () => {
		const t = parseTrenitalia(
			trenitalia({ coach: 0, seatNumber: 0, seatLetter: '0', pnr: '000000', train: 55555 }),
			REFERENCE
		);
		expect(t.coach).toBe(0);
		expect(t.seat).toBe('');
		expect(t.pnr).toBe('');
		expect(t.trainNumber).toBe(55555);
	});

	it('is reached through the format dispatcher', () => {
		expect(parsePayload(trenitalia()).kind).toBe('trenitalia');
	});
});
