// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Customer cards (BahnCard and the like) are the one FCB document that dates
 * itself absolutely: a year plus a day of that year, where every other
 * document counts days from the issuing date. validUntilYear is an offset
 * from the valid-from year rather than a year of its own.
 *
 * The cards below are invented.
 */
import { describe, expect, it } from 'vitest';
import { summarizeFcb, type FcbTicket } from '../src/lib/tickets/model.ts';

function card(data: Record<string, unknown>): FcbTicket {
	return {
		// deliberately far from the card's own dates, to catch any code that
		// still treats these as offsets from the issuing date
		issuingDetail: { issuingYear: 2020, issuingDay: 200, issuerNum: 1080 },
		transportDocument: [{ ticket: { __choice__: 'customerCard', value: data } }]
	};
}

describe('customer card validity', () => {
	it('reads year and day-of-year as an absolute date', () => {
		const [doc] = summarizeFcb(
			card({ validFromYear: 2024, validFromDay: 60, validUntilYear: 0, validUntilDay: 300 })
		);
		expect(doc.type).toBe('customerCard');
		// 2024 is a leap year, so day 60 is the 29th
		expect(doc.validFrom).toBe('2024-02-29');
		expect(doc.validUntil).toBe('2024-10-26');
	});

	it('counts validUntilYear from the valid-from year', () => {
		const [doc] = summarizeFcb(
			card({ validFromYear: 2024, validFromDay: 60, validUntilYear: 1, validUntilDay: 59 })
		);
		expect(doc.validUntil).toBe('2025-02-28');
	});

	it('treats a missing validUntilYear as the same year', () => {
		const [doc] = summarizeFcb(card({ validFromYear: 2027, validFromDay: 1, validUntilDay: 365 }));
		expect(doc.validFrom).toBe('2027-01-01');
		expect(doc.validUntil).toBe('2027-12-31');
	});

	it('falls back to the year alone when no day is given', () => {
		const [doc] = summarizeFcb(card({ validFromYear: 2027, validUntilYear: 2 }));
		expect(doc.validFrom).toBe('2027');
		expect(doc.validUntil).toBe('2029');
	});

	it('carries the card details through untouched', () => {
		const [doc] = summarizeFcb(
			card({
				validFromYear: 2024,
				validFromDay: 1,
				cardIdIA5: '1234567812345678',
				cardTypeDescr: 'Example Card 50 (2nd class)',
				classCode: 'second',
				customerStatus: 4
			})
		);
		expect(doc.data.cardIdIA5).toBe('1234567812345678');
		expect(doc.data.cardTypeDescr).toBe('Example Card 50 (2nd class)');
		expect(doc.trainBindings).toEqual([]);
	});
});
