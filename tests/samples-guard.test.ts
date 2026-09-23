// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Privacy guard: the bundled sample tickets shipped with the site
 * (static/samples) and the committed fixtures (tests/fixtures/public) must
 * only ever be the public DB Muster specimens, never personal tickets.
 *
 * Each payload is pinned by its SHA-256, so a new file, or a changed one, is
 * a test failure until someone adds it here on purpose. The traveller check
 * below is a second line, for the samples that ship.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/lib/tickets/parse.ts';
import type { FlexData } from '../src/lib/tickets/records/uflex.ts';
import type { FcbTicket } from '../src/lib/tickets/model.ts';

const SAMPLES = fileURLToPath(new URL('../static/samples', import.meta.url));
const REPO = fileURLToPath(new URL('..', import.meta.url));

/**
 * Every specimen payload in the repository, extracted from DB's two Muster
 * zips by scripts/extract-fixtures.py. Add to this only a file from those.
 */
const SPECIMENS: Record<string, string> = {
	'static/samples/muster-quer-durchs-land.bin': '5554e458dd10425a10aa83c4efb04bcea037334fba865e9d42c6223865c513e2',
	'static/samples/muster-super-sparpreis.bin': 'ae80195d2087ba8fe4ebce5931cf9e03fa461045de7f1546e04cd2ea933bd4ea',
	'tests/fixtures/public/muster-918-3-city-mobil-ticket.bin': '9ae2842930b2ab2c1320c813b49489ba61d05762dffec38ac85ab67232b017f3',
	'tests/fixtures/public/muster-918-3-city-ticket.bin': 'a9c3d4c63cc3ddba599451209a3fe1677b1cf56f7b02f0c24a37630ef40206d0',
	'tests/fixtures/public/muster-918-3-quer-durchs-land-ticket.bin': '5554e458dd10425a10aa83c4efb04bcea037334fba865e9d42c6223865c513e2',
	'tests/fixtures/public/muster-918-3-schleswig-holstein-ticket.bin': '7f4d3a42b931aae9e274ad0864df186e7b6fe74a3d3c7b7f4cc713ff0bea74f8',
	'tests/fixtures/public/muster-918-9-bahncard-25.bin': '91b23fb27ac84b80ad60e2eba12a0103ecf20640f32c9257c4d95de07600eb50',
	'tests/fixtures/public/muster-918-9-cityticket-international.bin': '3c9c0c4bb78b9059ed4ef251aa8796c7b9b1136098a37933ae8df4540837a037',
	'tests/fixtures/public/muster-918-9-cityticket.bin': 'a5ecf4a896375619a713d7d9cea31538b06e02344e51d341008cf701caf3352c',
	'tests/fixtures/public/muster-918-9-deutschland-jobticket.bin': '639a12de03926b932b00db8327784e25b1c0c5c5a910828f2c317c2cdce6c246',
	'tests/fixtures/public/muster-918-9-deutschland-ticket.bin': 'df06d641422d9442272f32f840cc6ff12e28315bbb0e94012a14ad13e7d4c388',
	'tests/fixtures/public/muster-918-9-fv-supersparpreis-2erw.bin': '4f86a48338de6cdaaaf1d1662eff9de85e7e7da27a71ddaa81fdae7adc777bb5',
	'tests/fixtures/public/muster-918-9-fv-supersparpreis-3erw-inklr-ckfahrt.bin': 'cd28f8cf0fa15fdb801bbb6aa84a587ec5991bbd8ca88a2da58455a81b5e5ae9',
	'tests/fixtures/public/muster-918-9-fv-supersparpreis.bin': 'ae80195d2087ba8fe4ebce5931cf9e03fa461045de7f1546e04cd2ea933bd4ea',
	'tests/fixtures/public/muster-918-9-fv-supersparpreissenior-inklr-ckfahrt.bin': '0b187330ec38badf1ea8f3348841fa96848b822b34e6c5e2b8c5b3272a29ae8c',
	'tests/fixtures/public/muster-918-9-fv-supersparpreisyoung.bin': '1898e8aa98faebabf3f04b37c9edb5ec222eb3392aeb6f570113146f57efd508',
	'tests/fixtures/public/muster-918-9-l-nderticket-bayern-nacht.bin': '064c10ee0c0eabc4e1b53d68cc95798503d81dcd85b904d540f3e3a5bd398f38',
	'tests/fixtures/public/muster-918-9-l-nderticket-rheinland-pfalz.bin': '3b90f1f0872fdac8a9c33caf2506be94bfd0d5720a51670fbeca3dc895ec3b45',
	'tests/fixtures/public/muster-918-9-l-nderticket-saarland.bin': '2c9ef0d82faee8f045feaa19f69f974b82aaecd338bc8b2f3387b68d9b804ce6',
	'tests/fixtures/public/muster-918-9-l-nderticket-sachsen-anhalt.bin': '38b495c47ad97ff18ae924492391d7e959e3d50c5258a2735d3a754ee005f1fa',
	'tests/fixtures/public/muster-918-9-l-nderticket-th-ringen.bin': 'ee5d23f7e526775c2912fab244ac74e3882f65c55cec5576978a960e760c9065',
	'tests/fixtures/public/muster-918-9-normalpreis.bin': '67ecb729f4764affd26d029ff5882a8ff5fbca25596aacd7b16414b1c32f4789',
	'tests/fixtures/public/muster-918-9-quer-durchs-land-ticket.bin': '292bc318598aa08009d0fc4957d5242ee6a596a5012a7655d0aeaa9ddc9e8f8e',
	'tests/fixtures/public/muster-918-9-schleswig-holstein-ticket.bin': 'c274bd1451136ae5ddadba7e301b497efe14ef4de81a894015acb605263a0324'
};

const sha256 = (path: string) => createHash('sha256').update(readFileSync(join(REPO, path))).digest('hex');
const listed = (dir: string) => readdirSync(join(REPO, dir)).map((f) => `${dir}/${f}`);

describe('specimen payloads are pinned', () => {
	const payloads = [...listed('static/samples'), ...listed('tests/fixtures/public')].filter((p) =>
		p.endsWith('.bin')
	);

	it.each(payloads)('%s is a known specimen', (path) => {
		expect(SPECIMENS[path], `${path} is not in the specimen list`).toBeDefined();
		expect(sha256(path), `${path} is not the specimen it is listed as`).toBe(SPECIMENS[path]);
	});

	it('holds nothing but payloads and their decoded ground truth', () => {
		for (const path of [...listed('static/samples'), ...listed('tests/fixtures/public')]) {
			if (path.endsWith('.bin')) continue;
			expect(path, `unexpected file ${path}`).toMatch(/^tests\/fixtures\/public\/.+\.expected\.json$/);
			expect(SPECIMENS[path.replace('.expected.json', '.bin')], `${path} has no pinned payload`).toBeDefined();
		}
	});

	it('lists nothing that is no longer there', () => {
		expect(Object.keys(SPECIMENS).filter((path) => !payloads.includes(path))).toEqual([]);
	});
});

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
