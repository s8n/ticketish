// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A file can hold several barcodes, and one that a certain detector claims
 * and then fails to parse is broken rather than unrecognised. It is reported
 * as an error, and the others in the same file are still read.
 */
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ingestFile } from '../src/lib/input/ingest.ts';

/** A pass file whose barcodes carry these messages, one each. */
function pass(...messages: string[]): File {
	const json = {
		barcodes: messages.map((message) => ({
			format: 'PKBarcodeFormatQR',
			message,
			messageEncoding: 'iso-8859-1'
		}))
	};
	const zip = zipSync({ 'pass.json': strToU8(JSON.stringify(json)) });
	return new File([zip], 'test.pkpass');
}

describe('ingesting a file', () => {
	it('reports a broken barcode and still reads the rest', async () => {
		// "#UT" settles the format, and version 99 is not one there is
		const { tickets, errors } = await ingestFile(pass('#UT99' + '0'.repeat(40), 'hello'));
		expect(tickets.map((t) => t.container.kind)).toEqual(['text']);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/^test\.pkpass: .*version 99/);
	});

	it('reports a broken raw payload rather than throwing', async () => {
		const file = new File([strToU8('#UT99' + '0'.repeat(40))], 'broken.bin');
		const { tickets, errors } = await ingestFile(file);
		expect(tickets).toEqual([]);
		expect(errors[0]).toMatch(/^broken\.bin: /);
	});
});
