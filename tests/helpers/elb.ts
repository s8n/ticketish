// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Builds a synthetic ELB record, laid out element by element as ERA TAP TSI
 * B.12 section 8.1 lists them. Every default here is invented: no value from
 * a real ticket appears in this repo's tests (see AGENTS.md).
 */

export interface ElbSegmentParts {
	departure?: string;
	arrival?: string;
	/** Six characters, five digits plus a blank on every sample seen. */
	train?: string;
	security?: string;
	/** Day of the year, three digits. */
	departureDay?: string;
	coach?: string;
	seat?: string;
	travelClass?: string;
	tariff?: string;
	service?: string;
}

export interface ElbParts {
	idFormat?: string;
	pectab?: string;
	ticketCode?: string;
	pnr?: string;
	ticketNumber?: string;
	specimen?: string;
	version?: string;
	sequence?: string;
	nonUsed?: string;
	travelerType?: string;
	adults?: string;
	children?: string;
	/** Last digit of the year, which is all the record carries. */
	year?: string;
	emissionDay?: string;
	beginDay?: string;
	endDay?: string;
	segment1?: ElbSegmentParts;
	/** Left blank unless a second leg is wanted. */
	segment2?: ElbSegmentParts | null;
	/** Issuer added block past the end of the specified record. */
	seal?: string;
	/** Total length; the real records are 120, 121 or 165 characters. */
	length?: number;
}

const SEGMENT_DEFAULTS: Required<ElbSegmentParts> = {
	departure: 'FRAAA',
	arrival: 'GBZZZ',
	train: '09999 ',
	security: '9999',
	departureDay: '266',
	coach: '003',
	seat: '007',
	travelClass: '2',
	tariff: 'XX99',
	service: 'QQ'
};

export function elbSegment(parts: ElbSegmentParts = {}): string {
	const p = { ...SEGMENT_DEFAULTS, ...parts };
	const s =
		p.departure + // +0
		p.arrival + // +5
		p.train + // +10, six wide
		p.security + // +16
		p.departureDay + // +20
		p.coach + // +23
		p.seat + // +26
		p.travelClass + // +29
		p.tariff + // +30
		p.service; // +34
	if (s.length !== 36) throw new Error(`segment is ${s.length} characters, not 36`);
	return s;
}

export function buildElb(parts: ElbParts = {}): Uint8Array {
	const p = {
		idFormat: 'e',
		pectab: 'R',
		ticketCode: 'IV',
		pnr: 'TESTPN',
		ticketNumber: '123456789',
		specimen: '1',
		version: '1',
		sequence: '11',
		nonUsed: '0'.repeat(10),
		travelerType: '  ',
		adults: '01',
		children: '00',
		year: '4',
		emissionDay: '254',
		beginDay: '266',
		endDay: '300',
		segment1: {},
		segment2: null,
		seal: '',
		length: 121,
		...parts
	};

	const header =
		p.idFormat + // 0
		p.pectab + // 1
		p.ticketCode + // 2
		p.pnr + // 4
		p.ticketNumber + // 10
		p.specimen + // 19
		p.version + // 20
		p.sequence + // 21
		p.nonUsed + // 23, ten wide
		p.travelerType + // 33
		p.adults + // 35
		p.children + // 37
		p.year + // 39
		p.emissionDay + // 40
		p.beginDay + // 43
		p.endDay; // 46
	if (header.length !== 49) throw new Error(`header is ${header.length} characters, not 49`);

	const s =
		header +
		elbSegment(p.segment1) + // 49
		(p.segment2 ? elbSegment(p.segment2) : '') + // 85
		p.seal;
	if (s.length > p.length) throw new Error(`record is ${s.length} characters, over ${p.length}`);
	return new Uint8Array([...s.padEnd(p.length, ' ')].map((c) => c.charCodeAt(0)));
}
