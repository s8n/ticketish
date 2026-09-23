// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Synthetic SSB1 tickets, as VR issues them, from invented values. */
import { BitWriter } from './build.ts';

/** 107 bytes, bit-packed, with no separate signature block. */
export function buildSsb1({
	rics = 10,
	adults = 1,
	children = 0,
	validFromDay = 106,
	validUntilDay = 106,
	departureStation = 'AAA',
	arrivalStation = 'BBB',
	departureUic = null as number | null,
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
	// the departure station is a name, or a number where one is given
	if (departureUic === null) w.bool(false).strAlpha(departureStation, 5); // bits 106..136
	else w.bool(true).int(departureUic, 20).padTo(136);
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
