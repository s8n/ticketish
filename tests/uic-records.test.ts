/**
 * UIC 918.3 records that are not covered elsewhere: the printed layout, and
 * the header flags including an issuer whose specimen bit cannot be trusted.
 * Envelopes are built by the test.
 */
import { describe, expect, it } from 'vitest';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { HeadData } from '../src/lib/tickets/records/uhead.ts';
import type { LayoutData } from '../src/lib/tickets/records/utlay.ts';
import { uicEnvelope, uicHead, uicLayout, uicRecord } from './helpers/build.ts';

const head = (rics: number, flags: string) =>
	uicRecord('U_HEAD', 1, uicHead({ rics, flags, ticketId: 'TESTTICKET0001' }));

describe('U_HEAD flags', () => {
	it('reads the flag digit into named booleans', () => {
		// "1" is international, "4" is specimen, "6" is both agent and specimen
		const c = parsePayload(uicEnvelope(1080, head(1080, '1')));
		if (c.kind !== 'uic9183') return;
		const data = c.envelope.records[0].data as HeadData;
		expect(data.flags.internationalTicket).toBe(true);
		expect(data.flags.specimen).toBe(false);
		expect(data.ticketId).toBe('TESTTICKET0001');
		expect(data.distributingRics).toBe(1080);
	});

	it('trusts the specimen bit for a normal issuer', () => {
		const c = parsePayload(uicEnvelope(1080, head(1080, '4')));
		if (c.kind !== 'uic9183') return;
		const data = c.envelope.records[0].data as HeadData;
		expect(data.flags.specimen).toBe(true);
		expect(data.specimenSuspect).toBe(false);
	});

	it('distrusts it for issuers that set it on genuine tickets', () => {
		// NS home print tickets carry flags "6" on real tickets, so the
		// specimen bit alone must not mark them as specimens
		for (const rics of [1084, 1184]) {
			const c = parsePayload(uicEnvelope(rics, head(rics, '6')));
			if (c.kind !== 'uic9183') return;
			const data = c.envelope.records[0].data as HeadData;
			expect(data.flags.specimen).toBe(true);
			expect(data.flags.editedByAgent).toBe(true);
			expect(data.specimenSuspect).toBe(true);
		}
	});
});

describe('U_TLAY printed layout', () => {
	const layout = uicLayout([
		{ line: 0, column: 0, text: 'Testland Ticket' },
		{ line: 2, column: 0, text: 'Musterstadt Hbf' },
		{ line: 3, column: 0, text: 'Beispielstadt Hbf' }
	]);

	it('parses the field grid', () => {
		const c = parsePayload(uicEnvelope(1080, uicRecord('U_TLAY', 1, layout)));
		expect(c.kind).toBe('uic9183');
		if (c.kind !== 'uic9183') return;
		const record = c.envelope.records.find((r) => r.kind === 'layout');
		expect(record?.error).toBeUndefined();
		const data = record?.data as LayoutData;
		expect(data.standard).toBe('RCT2');
		expect(data.fields).toHaveLength(3);
		expect(data.fields.map((f) => f.text)).toEqual([
			'Testland Ticket',
			'Musterstadt Hbf',
			'Beispielstadt Hbf'
		]);
		expect(data.fields[1].line).toBe(2);
	});

	it('keeps an issuer specific layout tag verbatim', () => {
		// DSB writes "RTC2" rather than "RCT2"; the tag is shown as found
		const odd = 'RTC2' + layout.slice(4);
		const c = parsePayload(uicEnvelope(1186, uicRecord('U_TLAY', 1, odd)));
		if (c.kind !== 'uic9183') return;
		const data = c.envelope.records.find((r) => r.kind === 'layout')?.data as LayoutData;
		expect(data.standard).toBe('RTC2');
	});

	it('shifts columns for issuers that number them from one', () => {
		const normal = parsePayload(uicEnvelope(1080, uicRecord('U_TLAY', 1, layout)));
		const shifted = parsePayload(uicEnvelope(1084, uicRecord('U_TLAY', 1, layout)));
		if (normal.kind !== 'uic9183' || shifted.kind !== 'uic9183') return;
		const a = normal.envelope.records[0].data as LayoutData;
		const b = shifted.envelope.records[0].data as LayoutData;
		expect(b.fields[0].column).toBe(a.fields[0].column - 1);
	});
});

describe('918.3 envelope', () => {
	it('splits several records out of one envelope', () => {
		const c = parsePayload(
			uicEnvelope(
				1080,
				head(1080, '0') + uicRecord('U_TLAY', 1, uicLayout([{ line: 0, column: 0, text: 'Hi' }]))
			)
		);
		expect(c.kind).toBe('uic9183');
		if (c.kind !== 'uic9183') return;
		expect(c.envelope.records.map((r) => r.id)).toEqual(['U_HEAD', 'U_TLAY']);
		expect(c.envelope.issuerRics).toBe(1080);
		expect(c.envelope.envelopeVersion).toBe(1);
	});

	it('reads a version 2 envelope, which has a longer signature', () => {
		const c = parsePayload(uicEnvelope(1080, head(1080, '0'), { version: 2 }));
		expect(c.kind).toBe('uic9183');
		if (c.kind !== 'uic9183') return;
		expect(c.envelope.envelopeVersion).toBe(2);
		expect(c.envelope.signature).toHaveLength(64);
	});

	it('keeps unknown records as raw bytes instead of failing', () => {
		const c = parsePayload(uicEnvelope(1080, uicRecord('XXXXXX', 1, 'whatever')));
		if (c.kind !== 'uic9183') return;
		expect(c.envelope.records[0].kind).toBe('unknown');
		expect(c.envelope.records[0].raw).toHaveLength(8);
	});
});
