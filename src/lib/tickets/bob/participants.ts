// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * BoB participant ids to the organisations that hold them.
 *
 * A BoB ticket names its issuer by this id and by nothing else, so without the
 * table a Skånetrafiken ticket and a Västtrafik one are told apart only by a
 * number. Built by scripts/build-bob-participants.py from Samtrafiken's
 * register; see participants.json's `_note` for where it comes from and what
 * was left out of it.
 *
 * Imported statically rather than on demand. It is under 3 KB, and the issuer
 * is drawn in the card header as the ticket renders, so making this a promise
 * would push an await into `containerInfo` for very little. The larger tables
 * here load lazily for the opposite reason.
 *
 * An id is not a RICS code and the two must not be read into each other. They
 * are separate numbering spaces that both start at small integers, so 10 is
 * Skånetrafiken here and something else entirely in the UIC tables.
 */
import table from './participants.json' with { type: 'json' };

const PARTICIPANTS = table.participants as Record<string, string>;

/**
 * Corrections applied over the register, since the generated table is not
 * edited by hand. Each one says why it is here.
 */
const OVERRIDES: Record<string, string> = {
	// The register's own cell is a sentence rather than a name: "BoB,
	// testservices. (You can always use PID 1 for testing.)". The parenthesis
	// is instruction to an implementer, not part of what the id is called.
	'1': 'BoB test services'
};

/** The organisation holding a participant id, or null when it is unknown. */
export function bobParticipantName(id: string | null | undefined): string | null {
	if (!id) return null;
	return OVERRIDES[id] ?? PARTICIPANTS[id] ?? null;
}

/**
 * A participant as the card names it: the organisation where the register has
 * one, and the bare id where it does not. An id the register has never heard
 * of is a real possibility rather than a bug, since ids are allocated as
 * participants join and this table is a copy taken on one day.
 */
export function bobParticipantLabel(id: string | null | undefined): string {
	if (!id) return 'BoB ticket';
	return bobParticipantName(id) ?? `BoB participant ${id}`;
}
