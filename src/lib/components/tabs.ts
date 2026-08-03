// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Which tabs a ticket card shows, and which one opens first.
 *
 * UIC 918.3 and DOSIPAS carry records, and each gets a tab named after the
 * record it opens. Every other format has a single view of its own, which
 * takes one tab named after the format plus "data", so it reads as the
 * counterpart to the barcode tab rather than as the header chip again. The
 * barcode is always last, so it is something to switch to rather than the
 * first thing shown.
 */

/** Richest first: the record a reader most likely wants open. */
const PREFERRED = ['flex', 'db-bl', 'layout', 'db-vu', 'head'];

export interface TabInput {
	/** TicketContainer kind. */
	kind: string;
	/** Parsed record kinds, in order; empty for the formats without records. */
	recordKinds: string[];
	/** The payload can be re-encoded, so a barcode tab is worth offering. */
	hasBarcode: boolean;
}

export interface TabModel {
	isEnvelope: boolean;
	/** Tabs before the barcode: one per record, or one for the format view. */
	leadingCount: number;
	barcodeIdx: number;
	/** False when the bar would hold a single tab that names nothing new. */
	showTabs: boolean;
	/** Index to open when the reader has not picked one; -1 for nothing. */
	defaultOpen: number;
}

export function tabModel({ kind, recordKinds, hasBarcode }: TabInput): TabModel {
	const isEnvelope = kind === 'uic9183' || kind === 'dosipas';
	const leadingCount = isEnvelope ? recordKinds.length : 1;

	// Record tabs name the record they open, so an envelope shows them even
	// when there is only one. The format tab just repeats the chip in the card
	// header, so it earns its place only once the barcode gives it somewhere to
	// switch to.
	const showTabs = isEnvelope ? recordKinds.length > 0 : hasBarcode;

	let defaultOpen: number;
	if (!isEnvelope) {
		defaultOpen = 0;
	} else {
		const preferred = PREFERRED.map((k) => recordKinds.indexOf(k)).find((i) => i >= 0);
		if (preferred !== undefined) defaultOpen = preferred;
		else if (recordKinds.length) defaultOpen = 0;
		// an envelope that carried no records has only the barcode, at index 0
		else defaultOpen = hasBarcode ? 0 : -1;
	}

	return { isEnvelope, leadingCount, barcodeIdx: leadingCount, showTabs, defaultOpen };
}
