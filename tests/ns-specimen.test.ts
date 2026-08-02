/**
 * NS home-print tickets set the U_HEAD flags byte to "6" (edited-by-agent +
 * specimen) on genuine tickets. The specimen bit must be flagged as suspect
 * for NS so real tickets don't get a "Specimen" badge.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { HeadData } from '../src/lib/tickets/records/uhead.ts';

const BIN = fileURLToPath(new URL('./fixtures/private/ns-ams-alkmaar.bin', import.meta.url));

describe.skipIf(!existsSync(BIN))('NS specimen flag quirk', () => {
	it('marks the specimen bit as suspect for NS tickets', () => {
		const container = parsePayload(new Uint8Array(readFileSync(BIN)));
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		expect(container.envelope.issuerRics).toBe(1084);
		const head = container.envelope.records.find((r) => r.kind === 'head');
		expect(head).toBeDefined();
		const data = head!.data as HeadData;
		expect(data.flags.specimen).toBe(true); // raw bit faithfully parsed
		expect(data.specimenSuspect).toBe(true); // but flagged as untrustworthy
	});

	it('keeps DSB specimen bit trusted (flags used correctly there)', () => {
		const dsb = fileURLToPath(new URL('./fixtures/private/dsb-hh-cph.bin', import.meta.url));
		if (!existsSync(dsb)) return;
		const container = parsePayload(new Uint8Array(readFileSync(dsb)));
		if (container.kind !== 'uic9183') return;
		const head = container.envelope.records.find((r) => r.kind === 'head');
		const data = head!.data as HeadData;
		expect(data.flags.specimen).toBe(false);
		expect(data.specimenSuspect).toBe(false);
	});
});
