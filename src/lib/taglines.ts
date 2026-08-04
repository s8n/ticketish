// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The line under the wordmark, picked afresh on every load.
 *
 * They are here rather than in the page because a list of jokes is content,
 * and because one of them is the page's own description of itself: the first
 * is the plain one, and the meta description stays plain whichever comes up,
 * so a visitor who lands on the absurd one still finds out what this is.
 */
export const TAGLINES = [
	'reads what your train ticket really says',
	"tells the barcode's side of the story",
	'reads the bits your ticket keeps to itself',
	"your ticket's got nothing to hide... right?",
	'snitches what the barcode says behind your back',
	'a greener bagger 288 for your barcodes',
	'overengineered for one small rectangle',
	'made with mild amounts of train autism',
	'even works met de trein WiFi',
	'wünscht ihnen eine angenehme reise',
	'for curious people stuck in delayed trains'
];

/** One of them. `random` is a parameter so a test can pin the arithmetic. */
export function pickTagline(random: () => number = Math.random): string {
	return TAGLINES[Math.floor(random() * TAGLINES.length)];
}
