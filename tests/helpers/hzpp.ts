// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Synthetic plaintext HŽPP tickets, from invented values. */
import { latin1 } from './build.ts';

/** Minutes from the 2003 epoch to an instant, which is what the record stores. */
export const hzppMinutes = (iso: string) =>
	Math.round((Date.parse(iso) / 1000 - 1041375600) / 60);

export interface HzppParts {
	ticketNumber?: string;
	ticketType?: number;
	/** Minor units, as the record carries it. */
	price?: number;
	out?: [number, number, number, number, number];
	ret?: [number, number, number, number, number];
	validFrom?: string;
	validUntil?: string;
	pax1?: [number, number];
	pax2?: [number, number];
	extendedValidity?: boolean;
	issuedOnBoard?: boolean;
	outTrains?: [number, string, string, number, string, string];
	retTrains?: [number, string, string, number, string, string];
}

/** The 33 pipe separated fields, in the order zuegli reads them. */
export function buildHzpp(parts: HzppParts = {}): Uint8Array {
	const p = {
		ticketNumber: 'TEST0000001',
		ticketType: 10001,
		price: 1499,
		// from, to, via route, class, train type
		out: [72480, 76660, 0, 2, 100] as [number, number, number, number, number],
		ret: [0, 0, 0, 0, 0] as [number, number, number, number, number],
		validFrom: '2024-06-01T08:00:00Z',
		validUntil: '2024-06-02T08:00:00Z',
		pax1: [1, 11] as [number, number],
		pax2: [0, 0] as [number, number],
		extendedValidity: false,
		issuedOnBoard: false,
		outTrains: [0, '', '', 0, '', ''] as [number, string, string, number, string, string],
		retTrains: [0, '', '', 0, '', ''] as [number, string, string, number, string, string],
		...parts
	};

	const fields = [
		p.ticketNumber, // 0
		p.ticketType, // 1
		p.price, // 2
		...p.out, // 3-7
		...p.ret, // 8-12
		hzppMinutes(p.validFrom), // 13
		hzppMinutes(p.validUntil), // 14
		p.pax1[0], // 15
		p.pax1[1], // 16
		p.pax2[0], // 17
		p.pax2[1], // 18
		p.extendedValidity ? 1 : 0, // 19
		p.issuedOnBoard ? 1 : 0, // 20
		...p.outTrains, // 21-26
		...p.retTrains // 27-32
	];

	if (fields.length !== 33) throw new Error(`built ${fields.length} fields, not 33`);
	return latin1('B1' + fields.join('|'));
}
