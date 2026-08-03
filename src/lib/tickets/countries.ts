// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Country name lookups: UIC country codes (from the UIC reference data) and
 * ISO 3166-1 numeric (used by FCB countryOfResidence). */
import uicCountries from './data/uic-countries.json' with { type: 'json' };

const UIC = uicCountries as Record<string, { iso: string; name: string }>;

export function uicCountryName(code: number | string): string {
	const entry = UIC[String(code)];
	if (!entry) return `country ${code}`;
	// Prefer the (shorter) Intl region name over UIC's official long form,
	// e.g. "North Macedonia" instead of "Macedonia, The former Yugoslav
	// Republic of".
	if (entry.iso && displayNames) {
		try {
			const intl = displayNames.of(entry.iso);
			if (intl && intl !== entry.iso) return intl;
		} catch {
			// fall through to UIC name
		}
	}
	return entry.name;
}

export function uicCountryIso(code: number | string): string | null {
	return UIC[String(code)]?.iso ?? null;
}

// ISO 3166-1 numeric → alpha-2, Europe and common neighbours.
const ISO_NUMERIC: Record<number, string> = {
	8: 'AL', 20: 'AD', 31: 'AZ', 40: 'AT', 51: 'AM', 56: 'BE', 70: 'BA', 100: 'BG',
	112: 'BY', 124: 'CA', 156: 'CN', 191: 'HR', 196: 'CY', 203: 'CZ', 208: 'DK',
	233: 'EE', 246: 'FI', 250: 'FR', 268: 'GE', 276: 'DE', 300: 'GR', 348: 'HU',
	352: 'IS', 356: 'IN', 372: 'IE', 376: 'IL', 380: 'IT', 392: 'JP', 398: 'KZ',
	410: 'KR', 428: 'LV', 438: 'LI', 440: 'LT', 442: 'LU', 470: 'MT', 484: 'MX',
	498: 'MD', 499: 'ME', 504: 'MA', 528: 'NL', 578: 'NO', 616: 'PL', 620: 'PT',
	642: 'RO', 643: 'RU', 682: 'SA', 688: 'RS', 703: 'SK', 705: 'SI', 724: 'ES',
	752: 'SE', 756: 'CH', 792: 'TR', 804: 'UA', 807: 'MK', 826: 'GB', 840: 'US'
};

const displayNames =
	typeof Intl !== 'undefined' && Intl.DisplayNames
		? new Intl.DisplayNames(['en'], { type: 'region' })
		: null;

export function isoNumericCountryName(code: number): string {
	const alpha2 = ISO_NUMERIC[code];
	if (!alpha2) return `country ${code}`;
	try {
		return displayNames?.of(alpha2) ?? alpha2;
	} catch {
		return alpha2;
	}
}
