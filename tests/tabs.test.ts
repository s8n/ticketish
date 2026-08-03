// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Which tabs a ticket card offers. The card itself is not rendered here; the
 * decision is a pure function so the awkward combinations can be checked.
 */
import { describe, expect, it } from 'vitest';
import { tabModel } from '../src/lib/components/tabs.ts';

const model = (kind: string, recordKinds: string[], hasBarcode: boolean) =>
	tabModel({ kind, recordKinds, hasBarcode });

describe('envelope formats', () => {
	it('gives each record a tab and puts the barcode last', () => {
		const t = model('uic9183', ['head', 'layout', 'flex'], true);
		expect(t.isEnvelope).toBe(true);
		expect(t.leadingCount).toBe(3);
		expect(t.barcodeIdx).toBe(3);
		expect(t.showTabs).toBe(true);
	});

	it('opens the richest record rather than the first', () => {
		// flex beats layout beats head, whatever order they came in
		expect(model('uic9183', ['head', 'layout', 'flex'], true).defaultOpen).toBe(2);
		expect(model('uic9183', ['head', 'layout'], true).defaultOpen).toBe(1);
		expect(model('uic9183', ['head'], true).defaultOpen).toBe(0);
		// nothing recognised, so the first record it is
		expect(model('dosipas', ['mystery', 'other'], true).defaultOpen).toBe(0);
	});

	it('keeps a single record tab, because the tab names the record', () => {
		const t = model('uic9183', ['head'], false);
		expect(t.showTabs).toBe(true);
		expect(t.defaultOpen).toBe(0);
	});

	it('falls back to the barcode when the envelope carried no records', () => {
		expect(model('uic9183', [], true)).toMatchObject({ defaultOpen: 0, barcodeIdx: 0 });
		// and has nothing at all to show without one
		expect(model('uic9183', [], false).defaultOpen).toBe(-1);
	});
});

describe('formats with a single view', () => {
	it('names a tab after the format so the barcode is not what opens', () => {
		for (const kind of ['vdv', 'text', 'tcdd', 'sncf-eticket', 'unknown']) {
			const t = model(kind, [], true);
			expect(t.isEnvelope, kind).toBe(false);
			expect(t.leadingCount, kind).toBe(1);
			expect(t.barcodeIdx, kind).toBe(1);
			expect(t.showTabs, kind).toBe(true);
			// the format view opens, not the barcode
			expect(t.defaultOpen, kind).toBe(0);
		}
	});

	it('drops the tab bar when there is no barcode to switch to', () => {
		// a raw payload file has no symbology, so one tab would just repeat the
		// format chip already in the card header
		const t = model('vdv', [], false);
		expect(t.showTabs).toBe(false);
		expect(t.defaultOpen).toBe(0);
	});
});
