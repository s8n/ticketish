// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The shape every wallet mapping fills, and the pieces more than one mapping
 * shares. The mappings themselves are under `extract/`, one file per format,
 * and `trip.ts` is where one is chosen for a ticket.
 */
import type { TicketContainer } from '../tickets/types.ts';
import type { NovaOrgTable } from '../tickets/swisspass/orgs.ts';
import type { RenfeStationTable } from '../tickets/renfe/stations.ts';
import type { IssuerTables } from '../tickets/uic/rics.ts';
import type { StationTable } from '../tickets/stations.ts';
import type { OperatorCode } from './colors.ts';

/** A labelled row for the back of the pass, where anything unmapped goes. */
export interface TripField {
	label: string;
	value: string;
}

/**
 * A ticket reduced to what a wallet pass can show.
 *
 * Times are ISO local strings without a zone, because that is what the
 * formats carry: none of them says which zone its wall clock is in. Turning
 * them into instants happens at the last moment, in the pass writers, where
 * each platform's rules about zones apply.
 */
export interface TripSummary {
	/**
	 * A journey has a departure to show; a period ticket has an area and a
	 * date range. Apple and Google both lay the two out differently.
	 */
	shape: 'journey' | 'period';
	issuer: string;
	/**
	 * The issuer as a code rather than a name, where the format carries one.
	 * Names vary by year and by subsidiary; the code is what a colour or any
	 * other per-operator decision should key on.
	 */
	operator?: OperatorCode;
	/**
	 * Minutes east of UTC for the departure and the start of validity, where
	 * the format says. FCB and SwissPass carry it and nothing else here does,
	 * so it is usually absent and the times are then a wall clock with no zone
	 * attached to it.
	 */
	startUtcOffset?: number;
	/**
	 * The same for the arrival and the end of validity. It is its own field
	 * because the two ends can fall either side of a change to or from summer
	 * time, or in different zones.
	 */
	endUtcOffset?: number;
	product?: string;
	travelClass?: string;
	passenger?: string;
	from?: string;
	to?: string;
	via?: string;
	departure?: string;
	arrival?: string;
	train?: string;
	coach?: string;
	seat?: string;
	validFrom?: string;
	validUntil?: string;
	ticketId?: string;
	/** Booking reference: the issuer's PNR, where the format carries one. */
	reference?: string;
	price?: string;
	details: TripField[];
}

/** Tables a mapping may need, loaded before it runs so it can stay direct. */
export interface Tables {
	stations: StationTable | null;
	vdvOrgs: Record<string, string> | null;
	vdvProducts: Record<string, string> | null;
	renfeStations: RenfeStationTable | null;
	/** The company code tables, for naming an issuer by its code. */
	issuerNames: IssuerTables | null;
	/** Swiss organisation numbers, which NOVA tickets name their seller by. */
	novaOrgs: NovaOrgTable | null;
}

export type Kind = TicketContainer['kind'];
export type Of<K extends Kind> = Extract<TicketContainer, { kind: K }>;

export interface Extractor<K extends Kind> {
	/** Which on-demand tables this mapping wants before it runs. */
	needs?: (
		| 'stations'
		| 'vdvOrgs'
		| 'vdvProducts'
		| 'renfeStations'
		| 'issuerNames'
		| 'novaOrgs'
	)[];
	map: (container: Of<K>, tables: Tables) => TripSummary | null;
}

const CLASS_NAMES: Record<string, string> = {
	first: '1st class',
	second: '2nd class',
	tourist: 'Tourist',
	comfort: 'Comfort',
	business: 'Business',
	all: 'Any class',
	premiumFirst: 'Premium 1st',
	premiumSecond: 'Premium 2nd',
	standard: 'Standard',
	standardPremium: 'Standard Premium'
};

export const travelClass = (code: unknown): string | undefined =>
	typeof code === 'string' ? (CLASS_NAMES[code] ?? code) : undefined;

/** The envelope's issuer as a code, where it is one. DOSIPAS writes it as text. */
export function ricsOperator(issuerRics: number | string | null): OperatorCode | undefined {
	const code = typeof issuerRics === 'string' ? Number(issuerRics) : issuerRics;
	return typeof code === 'number' && Number.isInteger(code) && code > 0
		? { scheme: 'rics', code }
		: undefined;
}
