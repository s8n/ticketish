/** RSP6 (UK) parsing against Python-generated ground truth (private fixtures). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { Rsp6TicketData } from '../src/lib/tickets/rsp/rsp6.ts';

const CASES = ['uk-heathrow-london', 'uk-london-cardiff'].map((name) => ({
	name,
	bin: fileURLToPath(new URL(`./fixtures/private/${name}.bin`, import.meta.url)),
	expected: fileURLToPath(new URL(`./fixtures/private/${name}.expected.json`, import.meta.url))
}));

describe.skipIf(!CASES.every((c) => existsSync(c.bin)))('RSP6 tickets', () => {
	it.each(CASES)('recovers and parses $name', ({ bin, expected }) => {
		const exp = JSON.parse(readFileSync(expected, 'utf8'));
		const container = parsePayload(new Uint8Array(readFileSync(bin)));
		expect(container.kind).toBe('rsp6');
		if (container.kind !== 'rsp6') return;
		const t = container.ticket;
		expect(t.keyRecovered).toBe(true);
		expect(t.error).toBeUndefined();
		expect(t.ticketType).toBe(exp.envelope.ticket_type);
		expect(t.ticketRef).toBe(exp.envelope.ticket_ref);
		expect(t.issuerId).toBe(exp.envelope.issuer_id);
		expect(t.payloadHex).toBe(exp.recovered_hex);

		const d = t.data as Rsp6TicketData;
		expect(d.kind).toBe('ticket');
		expect(d.ticketReference).toBe(exp.ticket.ticket_reference);
		expect(d.standardClass).toBe(exp.ticket.standard_class);
		expect(d.lennonTicketType).toBe(exp.ticket.lennon_ticket_type);
		expect(d.fareLabel).toBe(exp.ticket.fare_label);
		expect(d.originNlc).toBe(exp.ticket.origin_nlc);
		expect(d.destinationNlc).toBe(exp.ticket.destination_nlc);
		expect(d.sellingNlc).toBe(exp.ticket.selling_nlc);
		expect(d.childTicket).toBe(exp.ticket.child_ticket);
		expect(d.discountCode).toBe(exp.ticket.discount_code);
		expect(d.routeCode).toBe(exp.ticket.route_code);
		expect(d.startDate).toBe(`${exp.ticket.start_date}T${exp.ticket.start_time}`);
		expect(d.specVersion).toBe(exp.ticket.spec_version);
		if (exp.ticket.purchase) {
			expect(d.purchase).not.toBeNull();
			expect(d.purchase!.pricePence).toBe(exp.ticket.purchase.price_pence);
			expect(d.purchase!.purchaseReference).toBe(exp.ticket.purchase.purchase_reference);
			expect(d.purchase!.daysOfValidity).toBe(exp.ticket.purchase.days_of_validity);
		}
	});
});
