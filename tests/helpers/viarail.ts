// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Synthetic VIA Rail boarding passes, from invented values. */
import { ascii } from './build.ts';

export interface ViaRailParts {
	ticketNumber?: string;
	surname?: string;
	car?: string;
	seat?: string;
	departureStation?: string;
	arrivalStation?: string;
	train?: string;
	departureTime?: string;
	givenName?: string;
	loyalty?: string;
	inventoryClass?: string;
	passengerType?: string;
	pnr?: string;
	purchaseTime?: string;
	/** Printers pad past the last field; the samples run to 130. */
	length?: number;
}

/** Lay the fixed-width record out field by field, then pad. */
export function buildViaRail(parts: ViaRailParts = {}): Uint8Array {
	const p = {
		ticketNumber: '1234567890123',
		surname: 'TESTSURNAME',
		car: '1',
		seat: '11B',
		departureStation: 'AAAA',
		arrivalStation: 'ZZZZ',
		train: 'VIA99',
		departureTime: '202406021607',
		givenName: 'TESTGIVEN',
		loyalty: 'P3',
		inventoryClass: 'J',
		passengerType: 'ADT',
		pnr: 'K00XYZ',
		purchaseTime: '20240601101002',
		length: 130,
		...parts
	};

	const s =
		p.ticketNumber + // 0
		p.surname.padEnd(30, ' ') + // 13
		p.car.padEnd(4, ' ') + // 43
		p.seat.padEnd(3, ' ') + // 47
		p.departureStation + // 50
		p.arrivalStation + // 54
		p.train.padEnd(7, ' ') + // 58
		p.departureTime + // 65
		p.givenName.padEnd(20, ' ') + // 77
		p.loyalty.padEnd(2, ' ') + // 97
		p.inventoryClass.padEnd(2, ' ') + // 99
		p.passengerType.padEnd(3, ' ') + // 101
		p.pnr + // 104
		p.purchaseTime; // 110

	if (s.length !== 124) throw new Error(`laid out ${s.length} characters, not 124`);
	return ascii(s.padEnd(p.length, ' '));
}
