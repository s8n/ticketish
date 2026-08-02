/**
 * Privacy guard: the bundled sample tickets shipped with the site
 * (static/samples) must only ever be the public DB Muster specimens,
 * never personal tickets.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { FlexData } from '../src/lib/tickets/records/uflex.ts';
import type { FcbTicket } from '../src/lib/tickets/model.ts';

const SAMPLES = fileURLToPath(new URL('../static/samples', import.meta.url));

// Note: DB does not set the specimen flag on its published Muster tickets, so
// the guard is by provenance (file naming + known test traveler), not flags.
describe('bundled samples are specimens only', () => {
	const files = readdirSync(SAMPLES);

	it('only contains muster files', () => {
		expect(files.length).toBeGreaterThan(0);
		for (const f of files) expect(f, `unexpected bundled sample ${f}`).toMatch(/^muster-/);
	});

	it.each(files.map((f) => ({ f })))('$f carries no real traveler', ({ f }) => {
		const container = parsePayload(new Uint8Array(readFileSync(join(SAMPLES, f))));
		expect(container.kind).toBe('uic9183');
		if (container.kind !== 'uic9183') return;
		for (const r of container.envelope.records) {
			if (r.kind !== 'flex') continue;
			const travelers =
				((r.data as FlexData).ticket as FcbTicket).travelerDetail?.traveler ?? [];
			for (const t of travelers) {
				expect(`${t.firstName} ${t.lastName}`, `real-looking traveler in ${f}`).toMatch(
					/Test|Muster/i
				);
			}
		}
	});
});
