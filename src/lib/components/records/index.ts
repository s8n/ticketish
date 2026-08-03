// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Maps record parser kinds (see src/lib/tickets/registry.ts) to view
 * components. To support a new record type: register a parser and add its
 * component here.
 */
import type { Component } from 'svelte';
import HeadView from './HeadView.svelte';
import LayoutView from './LayoutView.svelte';
import FlexView from './FlexView.svelte';
import DbBlView from './DbBlView.svelte';
import DbVuView from './DbVuView.svelte';
import OebbView from './OebbView.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const recordViews: Record<string, Component<{ data: any }>> = {
	head: HeadView,
	layout: LayoutView,
	flex: FlexView,
	'db-bl': DbBlView,
	'db-vu': DbVuView,
	oebb: OebbView
};

/** Friendly names for record ids shown on the tab strip. */
export function recordLabel(id: string, kind: string): string {
	const labels: Record<string, string> = {
		U_HEAD: 'Header',
		U_TLAY: 'Printed layout',
		U_FLEX: 'Ticket data',
		'0080BL': 'DB fare data',
		'0080VU': 'DB Verbund',
		'0080ID': 'DB ident',
		'118199': 'ÖBB validity'
	};
	return labels[id.trim()] ?? (kind !== 'unknown' ? kind : id.trim());
}
