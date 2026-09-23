// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Synthetic TCDD records, as the fields between their "$" separators. Every
 * value is made up; the station ids in the newer layout are ones the app's
 * table knows.
 */

// Older layout: magic first, then a version digit.
export const tcddClassic = [
	'TCDD_B', '6', '3', '0',
	'240010TESTTKT1', 'TESTPNR01', '20240519103000',
	'11111111111', '49549', '1', '2',
	'12345-19052024', '111111111', '222222222', '99999999999',
	'7', '12b', '1', '150.00', '200.00', '20240501121500',
	'null', 'null', '0', '', '250', 'a'.repeat(40)
];

// Newer layout: opens with the separator, then the magic and a product
// name where the older one has a version digit.
export const tcddModern = [
	'', 'TCDD_B', 'tcddprod',
	'T24TESTPNR000000000001', '24TESTPN', '20240519000000',
	'40000', 'AH', '2', '54321-19052024',
	// station ids in the current backend's numbering
	'5', '345', '2', '6', '21', '999.0', '20240501153142',
	'190000', '60', 'b'.repeat(40)
];
