// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * What the card needs to know about each container kind: what to call the
 * format, who issued the ticket, and which component draws it.
 *
 * These three used to be three parallel chains of twenty branches in
 * TicketCard, keyed on the same discriminant and easy to update in two places
 * out of three. One entry per kind keeps them together, the way
 * `records/index.ts` already does for the records inside an envelope.
 *
 * The map is typed over every kind in `TicketContainer`, so a new format is a
 * compile error here until it is named, which is what the `never` check in the
 * old switch was for.
 */
import type { Component } from 'svelte';
import type { PkpassInfo, TicketContainer } from '../tickets/types.ts';
import { ricsName, type IssuerTables } from '../tickets/uic/rics.ts';
import { novaOrgLabel, type NovaOrgTable } from '../tickets/swisspass/orgs.ts';
import { vdvOrgName } from '../tickets/vdv/orgs.ts';
import { bobParticipantLabel } from '../tickets/bob/participants.ts';
import Rsp6View from './Rsp6View.svelte';
import SwissPassView from './SwissPassView.svelte';
import VdvView from './VdvView.svelte';
import SsbView from './SsbView.svelte';
import RenfeView from './RenfeView.svelte';
import TcddView from './TcddView.svelte';
import Ssb1View from './Ssb1View.svelte';
import TrenitaliaView from './TrenitaliaView.svelte';
import EavView from './EavView.svelte';
import ElbView from './ElbView.svelte';
import MavView from './MavView.svelte';
import ViaRailView from './ViaRailView.svelte';
import HzppView from './HzppView.svelte';
import CdLegacyView from './CdLegacyView.svelte';
import NsbView from './NsbView.svelte';
import UzView from './UzView.svelte';
import SncfETicketView from './SncfETicketView.svelte';
import BobView from './BobView.svelte';

type Kind = TicketContainer['kind'];
type Of<K extends Kind> = Extract<TicketContainer, { kind: K }>;

/** What an issuer name may need beyond the container itself. */
export interface IssuerContext {
	/** VDV organisation table; null until it loads, so the code shows first. */
	vdvOrgs: Record<string, string> | null;
	/** The company code tables; null until they load, so the code shows first. */
	issuerNames?: IssuerTables | null;
	/** Swiss organisation numbers, for the formats that name an issuer by one. */
	novaOrgs?: NovaOrgTable | null;
	/** Apple Wallet metadata from the file the payload came out of. */
	passInfo?: PkpassInfo;
}

interface ContainerEntry<K extends Kind> {
	/** The format, as the header chip and the tab name it. */
	label: (c: Of<K>) => string;
	/** Who issued the ticket, or null when the format does not say. */
	issuer?: (c: Of<K>, ctx: IssuerContext) => string | null;
	/**
	 * Set where the issuer is named by company code, so the card knows to
	 * fetch the tables. They are large, and a format that spells its issuer
	 * out has no use for them.
	 */
	needsIssuerNames?: boolean;
	/** The same for the Swiss organisation numbers. */
	needsNovaOrgs?: boolean;
	/**
	 * The component that draws this container's data. Absent for the envelope
	 * formats, whose records each get their own view, and for the two that the
	 * card renders inline because they have no data to lay out.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	view?: Component<any>;
	/** The props that view takes, which are named per format. */
	props?: (c: Of<K>) => Record<string, unknown>;
}

const rics = (
	code: number | string | null | undefined,
	fallback: string,
	{ issuerNames }: IssuerContext
) =>
	ricsName(code, issuerNames) ?? (code !== null && code !== undefined ? `RICS ${code}` : fallback);

const containers: { [K in Kind]: ContainerEntry<K> } = {
	uic9183: {
		label: (c) => `UIC 918.3 v${c.envelope.envelopeVersion}`,
		issuer: (c, ctx) => rics(c.envelope.issuerRics || null, 'Unknown issuer', ctx),
		needsIssuerNames: true
	},
	dosipas: {
		label: (c) => `DOSIPAS U${c.envelope.headerVersion}`,
		issuer: (c, { issuerNames }) => {
			const sp = c.envelope.securityProvider;
			return ricsName(sp, issuerNames) ?? (sp !== null ? `Provider ${sp}` : 'Unknown issuer');
		},
		needsIssuerNames: true
	},
	rsp6: {
		label: (c) => (c.ticket.ticketType === '08' ? 'RSP6 railcard' : 'RSP6'),
		issuer: (c) => `National Rail (issuer ${c.ticket.issuerId})`,
		view: Rsp6View,
		props: (c) => ({ ticket: c.ticket })
	},
	swisspass: {
		label: () => 'SwissPass / NOVA',
		issuer: (c, { issuerNames, novaOrgs }) => {
			const keyRics = c.ticket.keyMeta?.rics;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const org = (c.ticket.ticketData as any)?.sale?.issuingOrg as number | undefined;
			// The NOVA org is who sold the ticket; the key's RICS is whoever
			// signed it, which on a Swiss ticket is often the association that
			// runs NOVA rather than the operator. Sold beats signed here, and
			// it is the order the pass colour already picks its operator in.
			return (
				novaOrgLabel(novaOrgs ?? null, org) ??
				ricsName(keyRics, issuerNames) ??
				(keyRics ? `RICS ${keyRics}` : 'SwissPass')
			);
		},
		needsIssuerNames: true,
		needsNovaOrgs: true,
		view: SwissPassView,
		props: (c) => ({ ticket: c.ticket })
	},
	vdv: {
		label: () => 'VDV-KA',
		issuer: (c, { vdvOrgs }) => {
			const t = c.barcode.tickets[0];
			if (!t) return 'VDV ticket';
			// vdvOrgs is null until the table loads, so this shows the numeric id
			// first and fills the name in, the way it did before any table existed
			return vdvOrgName(vdvOrgs, t.productOrgId) ?? `VDV org ${t.productOrgId}`;
		},
		view: VdvView,
		props: (c) => ({ barcode: c.barcode })
	},
	ssb: {
		label: (c) => `SSB v${c.envelope.version}`,
		issuer: (c, ctx) => rics(c.envelope.issuerRics, 'SSB', ctx),
		needsIssuerNames: true,
		view: SsbView,
		props: (c) => ({ envelope: c.envelope })
	},
	ssb1: {
		label: (c) => `SSB1 v${c.ticket.version}`,
		issuer: (c, ctx) => rics(c.ticket.issuerRics, 'SSB1', ctx),
		needsIssuerNames: true,
		view: Ssb1View,
		props: (c) => ({ ticket: c.ticket })
	},
	renfe: {
		label: () => 'Renfe',
		issuer: () => 'Renfe',
		view: RenfeView,
		props: (c) => ({ ticket: c.ticket })
	},
	tcdd: {
		label: () => 'TCDD',
		issuer: () => 'TCDD Taşımacılık',
		view: TcddView,
		props: (c) => ({ ticket: c.ticket })
	},
	trenitalia: {
		label: () => 'Trenitalia',
		issuer: () => 'Trenitalia',
		view: TrenitaliaView,
		props: (c) => ({ ticket: c.ticket })
	},
	eav: {
		label: () => 'EAV',
		issuer: () => 'EAV / UNICO Campania',
		view: EavView,
		props: (c) => ({ ticket: c.ticket })
	},
	mav: {
		label: (c) => `MÁV v${c.ticket.version}`,
		issuer: (c, { issuerNames }) => ricsName(c.ticket.issuerRics, issuerNames) ?? 'MÁV',
		needsIssuerNames: true,
		view: MavView,
		props: (c) => ({ ticket: c.ticket })
	},
	viarail: {
		label: () => 'VIA Rail',
		issuer: () => 'VIA Rail Canada',
		view: ViaRailView,
		props: (c) => ({ ticket: c.ticket })
	},
	hzpp: {
		label: (c) => (c.ticket.encrypted ? 'HŽPP (encrypted)' : 'HŽPP'),
		issuer: () => 'HŽPP',
		view: HzppView,
		props: (c) => ({ ticket: c.ticket })
	},
	'cd-legacy': {
		label: () => 'ČD #CD01',
		issuer: () => 'České dráhy',
		view: CdLegacyView,
		props: (c) => ({ ticket: c.ticket })
	},
	nsb: {
		label: () => 'NSB',
		issuer: () => 'NSB / Vy',
		view: NsbView,
		props: (c) => ({ ticket: c.ticket })
	},
	bob: {
		label: () => 'BoB',
		// BoB is the Swedish standard rather than one operator's format, and the
		// participant id is all a ticket says about who issued it. The bundled
		// register names most ids; one it has not heard of shows as its number,
		// since ids are allocated as participants join.
		issuer: (c) => bobParticipantLabel(c.ticket.issuer.issuerId),
		view: BobView,
		props: (c) => ({ ticket: c.ticket })
	},
	uz: {
		label: () => 'UZ boarding document',
		issuer: () => 'Укрзалізниця (UZ)',
		view: UzView,
		props: (c) => ({ ticket: c.ticket })
	},
	'sncf-eticket': {
		label: () => 'SNCF e-billet',
		issuer: () => 'SNCF',
		view: SncfETicketView,
		props: (c) => ({ ticket: c.ticket })
	},
	elb: {
		label: () => 'ELB (Element List Barcode)',
		// ELB is not one operator's format. The ticket code is the prefix printed
		// beside the ticket number, and is the only thing in the record that says
		// who issued it. Eurostar tickets are SNCF stock and carry its logo, with
		// Eurostar named as the carrier inside the record rather than as issuer.
		issuer: (c) =>
			({ IV: 'Eurostar', IZ: 'Eurostar', DV: 'SNCF' })[c.ticket.ticketCode] ?? 'ELB ticket',
		view: ElbView,
		props: (c) => ({ ticket: c.ticket })
	},
	text: {
		label: () => 'Plain text',
		issuer: (_c, { passInfo }) => passInfo?.organizationName || null
	},
	unknown: {
		label: () => 'Unknown'
	}
};

/**
 * The entry for a container. Each entry is checked against its own kind where
 * it is written, which is where a mistake would be made; looking one up by a
 * kind the compiler knows only as the whole union needs this cast to call
 * through, and the map being keyed by that same union is what makes it safe.
 */
export function containerInfo(container: TicketContainer): ContainerEntry<Kind> {
	return containers[container.kind] as ContainerEntry<Kind>;
}
