// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The PDF417 on a German eAU, the electronic Arbeitsunfähigkeitsbescheinigung
 * that a doctor issues instead of the old paper sick note.
 *
 * Not a ticket, and the only thing here that is not. It is in the app because
 * it is a barcode a person can be handed and cannot read, which is the same
 * reason as everything else.
 *
 * The barcode belongs to one copy of one form. An eAU is sent to the insurer
 * over the telematics infrastructure; when that fails, the practice prints the
 * Ausfertigung für die Krankenkasse and posts it, and this barcode is what the
 * insurer's scanner reads off that sheet. So it carries the diagnosis, which
 * the patient's copy also prints and the employer's copy deliberately leaves
 * out. The barcode itself is printed on the insurer's copy only.
 *
 * Layout: KBV_ITA_VGEX Technische Anlage zur eAU, version 1.13, table 17 in
 * section 7.3, with the field semantics from table 18 in section 8. Keep a
 * copy in `standards/` (gitignored, so fetch it from kbv.de) when working on
 * this. Twenty-eight fields separated by TAB in the order the table numbers
 * them, each only as long as its content, every field TAB terminated except
 * the last. The character set is ISO 8859-15, the one the eGK uses.
 *
 * Field 3 is the barcode version rather than the document's. The count ran to
 * 09 for the Blankoformularbedruckung of the old Muster 1a/E; 11 and up mean
 * the data behind it came from an eAU, which is what this reads.
 *
 * Versichertenart, besondere Personengruppe and DMP-Kennzeichnung are shown as
 * issued. The specification lists which codes may appear but hands their
 * meanings to KBV code systems it does not reproduce, and a sick note is not
 * the place to label a person's insurance from a guess.
 */

import { calendarDate } from '../dates.ts';

/** The constant head: Formularcode, Formularcodeergänzung, Versionsnummer. */
const FORM_CODE = '01';
const FORM_SUFFIX = 'a';

/** Versions from here up carry eAU data. Below it is the superseded form. */
const FIRST_EAU_VERSION = 11;

/** The version whose field table this reads. */
export const READS_VERSION = 11;

/** Enough fields to have reached the issue date, which is what is checked. */
const MIN_FIELDS = 12;

/** The table defines this many. A producer sending more keeps them. */
const TABLE_FIELDS = 28;

/** One ICD-10-GM code off field 27, with the two letters that may follow it. */
export interface EauDiagnosis {
	/** The ICD-10-GM code itself. */
	code: string;
	/** Diagnosesicherheit, one of G, V, Z or A. Shown as issued. */
	certainty: string | null;
	/** Seitenlokalisation, one of R, L or B. Shown as issued. */
	laterality: string | null;
	/** Pieces after the code that are neither letter, kept in order. */
	unread: string[];
}

const CERTAINTY = new Set(['G', 'V', 'Z', 'A']);
const LATERALITY = new Set(['R', 'L', 'B']);

export interface EauCertificate {
	/** Barcode version, 11 and up. */
	version: number;
	/** Ende des Versicherungsschutzes, where the card carried one. */
	coverageEnd: string | null;
	/** Institutionskennzeichen of the Kostenträger. */
	payerId: string | null;
	/** Versicherten-ID, the lifelong KVNR for a GKV patient. */
	insuredId: string | null;
	/** Versichertenart: 1, 3 or 5. Shown as issued. */
	insuredType: string | null;
	/** Besondere Personengruppe, two digits. Shown as issued. */
	personGroup: string | null;
	/** DMP-Kennzeichnung, two digits. Shown as issued. */
	dmp: string | null;
	/** (N)BSNR, the practice the form was issued at. */
	bsnr: string | null;
	/** LANR of the doctor who signed it. */
	lanr: string | null;
	issuedOn: string | null;
	/** Erstbescheinigung. */
	initial: boolean;
	/** Folgebescheinigung. */
	followUp: boolean;
	/** Endbescheinigung, which may be set beside either of the two above. */
	final: boolean;
	/** Arbeitsunfall, Arbeitsunfallfolgen or Berufskrankheit. */
	workAccident: boolean;
	/** Referred to a Durchgangsarzt after a work accident. */
	referredToDArzt: boolean;
	/** Sonstiger Unfall or Unfallfolgen. */
	otherAccident: boolean;
	/** Versorgungsleiden under the BVG and the laws beside it. */
	bvg: boolean;
	rehabilitation: boolean;
	/** Stufenweise Wiedereingliederung. */
	reintegration: boolean;
	/** Sonstige Maßnahmen, free text. */
	otherMeasures: string | null;
	/** Krankengeldfall: the AU is expected to reach its seventh week. */
	sickPayCase: boolean;
	unfitSince: string | null;
	unfitUntil: string | null;
	assessedOn: string | null;
	/** Up to six, in the order the form carries them. */
	diagnoses: EauDiagnosis[];
	/** Hinweise zur Diagnose, free text. */
	diagnosisNote: string | null;
	/** Anything a producer appended past the table, kept rather than dropped. */
	extraFields: string[];
}

/**
 * JJJJMMTT as an ISO date. Anything else, including a day the month does not
 * have, is left out rather than repaired.
 */
function date(value: string): string | null {
	if (!/^\d{8}$/.test(value)) return null;
	return calendarDate(+value.slice(0, 4), +value.slice(4, 6), +value.slice(6, 8));
}

/**
 * The barcode is ISO 8859-15 and nothing in it is a control character except
 * the TAB that separates the fields, so anything else says this is not one.
 */
function text(data: Uint8Array): string | null {
	for (const b of data) {
		if (b === 0x09) continue;
		if (b < 0x20 || (b >= 0x7f && b <= 0x9f)) return null;
	}
	return new TextDecoder('iso-8859-15').decode(data);
}

function split(data: Uint8Array): string[] | null {
	const s = text(data);
	if (s === null) return null;
	const fields = s.split('\t');
	return fields.length >= MIN_FIELDS ? fields : null;
}

/**
 * Diagnoses run "code certainty laterality", the two letters optional, and
 * several are separated by a comma and a space. Producers are loose about the
 * spacing: TeleClinic leaves the separator before an absent
 * Seitenlokalisation in place, so the comma may come with any whitespace
 * around it and empty pieces are dropped rather than counted as a field.
 *
 * The two letter sets do not overlap, so each letter is placed by which set it
 * belongs to rather than by position, and a code followed by a side alone does
 * not have the side read as its certainty. Anything that fits neither is kept
 * in `unread` rather than dropped.
 */
function diagnoses(value: string): EauDiagnosis[] {
	if (!value) return [];
	return value
		.split(/\s*,\s*/)
		.map((entry) => entry.split(/\s+/).filter(Boolean))
		.filter((parts) => parts.length > 0)
		.map(([code, ...rest]) => {
			const d: EauDiagnosis = { code, certainty: null, laterality: null, unread: [] };
			for (const piece of rest) {
				if (d.certainty === null && d.laterality === null && CERTAINTY.has(piece)) {
					d.certainty = piece;
				} else if (d.laterality === null && LATERALITY.has(piece)) {
					d.laterality = piece;
				} else {
					d.unread.push(piece);
				}
			}
			return d;
		});
}

export function isEau(data: Uint8Array): boolean {
	const fields = split(data);
	return !!fields && hasHead(fields);
}

/** The constant head, a barcode version from the eAU on, and an issue date. */
function hasHead(fields: string[]): boolean {
	return (
		fields[0] === FORM_CODE &&
		fields[1] === FORM_SUFFIX &&
		/^\d{2}$/.test(fields[2]) &&
		+fields[2] >= FIRST_EAU_VERSION &&
		date(fields[11]) !== null
	);
}

export function parseEau(data: Uint8Array): EauCertificate {
	const fields = split(data);
	if (!fields || !hasHead(fields)) throw new Error('not an eAU barcode');

	/** Table 17 numbers its fields from one. */
	const at = (n: number) => (fields[n - 1] ?? '').trim();
	const value = (n: number) => at(n) || null;
	const checked = (n: number) => at(n) === '1';

	return {
		version: +at(3),
		coverageEnd: date(at(4)),
		payerId: value(5),
		insuredId: value(6),
		insuredType: value(7),
		personGroup: value(8),
		dmp: value(9),
		bsnr: value(10),
		lanr: value(11),
		issuedOn: date(at(12)),
		initial: checked(13),
		followUp: checked(14),
		workAccident: checked(15),
		referredToDArzt: checked(16),
		unfitSince: date(at(17)),
		unfitUntil: date(at(18)),
		assessedOn: date(at(19)),
		otherAccident: checked(20),
		bvg: checked(21),
		rehabilitation: checked(22),
		reintegration: checked(23),
		otherMeasures: value(24),
		sickPayCase: checked(25),
		final: checked(26),
		diagnoses: diagnoses(at(27)),
		diagnosisNote: value(28),
		extraFields: fields.slice(TABLE_FIELDS)
	};
}
