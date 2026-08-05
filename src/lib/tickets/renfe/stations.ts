// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Renfe station codes to names.
 *
 * Renfe numbers its own stations rather than using the UIC code, so none of
 * the tables under `data/` reaches these: this is a short hand-curated list of
 * the ones that turn up most, small enough to import statically so callers can
 * stay synchronous. Codes are five digits with the leading zeros kept, which is
 * how they are printed on a ticket.
 *
 * Adding a station means being sure of it. An unknown code shows as a code,
 * which reads as "this app does not know" - a wrong name reads as a fact, and
 * on a wallet pass it is read by a ticket inspector.
 */
const STATIONS: Record<string, string> = {
	'60000': 'Madrid P. Atocha',
	'71801': 'Barcelona-Sants',
	'70000': 'Barcelona França',
	'11014': 'Sevilla-Santa Justa',
	'03216': 'Valencia Joaquín Sorolla',
	'54413': 'Málaga María Zambrano',
	'15100': 'Córdoba',
	'20309': 'Zaragoza-Delicias',
	'22308': 'Valladolid-Campo Grande',
	'78400': 'Girona',
	'79300': 'Figueres-Vilafant',
	'04040': 'Alicante-Terminal'
};

/** The station's name, or null when the list does not know the code. */
export function renfeStationName(code: string | undefined): string | null {
	if (!code) return null;
	return STATIONS[code.padStart(5, '0')] ?? null;
}

/** The same, falling back to the code itself so nothing shows as blank. */
export function renfeStationLabel(code: string | undefined, missing = '?'): string {
	if (!code) return missing;
	return renfeStationName(code) ?? `Station ${code}`;
}
