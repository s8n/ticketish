// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: EUPL-1.2
// Ported from zuegli (EUPL-1.2), so it cannot also be offered under MIT.

/**
 * Parser for DB "Via" route strings as found on tickets, e.g.
 *   Via: <1080>HAR*(HH*LWL*WBE/UE*SAW*SDL)*BSP
 * `<nnnn>` switches carrier, `*` separates route points, `(a/b)` are
 * alternative routings. Points are DB Leitpunktkürzel.
 *
 * Ported from zuegli's parse_via.py (© Q, EUPL-1.2). The Leitpunkt names come
 * from part 6 of DB's Entfernungswerk, the tariff document that defines them,
 * read into db-leitpunkte.json by scripts/build-db-leitpunkte.py and refreshed
 * monthly. It is an annual publication, so the JSON records which edition it
 * was built from.
 *
 * The table is imported statically rather than on demand: it is 16 KB, and a
 * Via text is drawn beside the ticket as it renders, so an await here would
 * push one into every caller for very little.
 */
import leitpunkte from './data/db-leitpunkte.json' with { type: 'json' };
import { ricsName } from './uic/rics.ts';

export interface ViaPoint {
	kind: 'point';
	code: string;
	/** Resolved station name, when the code is a known DB Leitpunkt. */
	name?: string;
}

export interface ViaOptions {
	kind: 'options';
	choices: ViaItem[][];
}

export type ViaItem = ViaPoint | ViaOptions;

export interface ViaCarrier {
	/** Carrier RICS codes for this section ("" = unspecified). */
	carriers: { code: string; name: string | null }[];
	items: ViaItem[];
}

const LEITPUNKTE = leitpunkte.points as Record<string, string>;

/** Which edition of the Entfernungswerk the names above were read from. */
export const LEITPUNKT_EDITION = leitpunkte._edition;

function point(code: string): ViaPoint {
	code = code.trim();
	const name = LEITPUNKTE[code];
	return name ? { kind: 'point', code, name } : { kind: 'point', code };
}

function carrierOf(num: string, items: ViaItem[]): ViaCarrier {
	if (items.length === 0) items.push({ kind: 'point', code: 'ANY' });
	return {
		carriers: num
			.split(',')
			.filter((c) => c !== '')
			.map((code) => ({ code, name: ricsName(code) })),
		items
	};
}

function hasContent(items: ViaItem[]): boolean {
	return items.some((i) => i.kind === 'options' || (i.kind === 'point' && i.code !== ''));
}

/** Parse a via string. Returns null when it doesn't look like a via route. */
export function parseDbVia(via: string): ViaCarrier[] | null {
	let pos = 0;
	const data = via;
	const eof = () => pos >= data.length;

	// skip until "Via:" or "<"
	let state: 'start' | 'carrier' | 'points' = 'start';
	const route: ViaCarrier[] = [];
	let carrierNum = '';
	let pointText = '';
	let items: ViaItem[] = [];
	const itemStack: ViaItem[][] = [];
	const slashStack: boolean[] = [];
	const optionsStack: ViaOptions[] = [];

	const flushPoint = () => {
		items.push(point(pointText));
		pointText = '';
	};

	while (!eof()) {
		const c = data[pos++];
		if (state === 'start') {
			if (c === '<') {
				state = 'carrier';
				carrierNum = '';
				pointText = '';
			} else if (c.toUpperCase() === 'V' && data.slice(pos, pos + 3).toUpperCase() === 'IA:') {
				pos += 3;
				state = 'points';
				carrierNum = '';
				pointText = '';
			}
		} else if (state === 'carrier') {
			if (c === '>') state = 'points';
			else carrierNum += c;
		} else {
			if (c === '*') {
				if (pointText) flushPoint();
				pointText = '';
			} else if (c === '(') {
				// look ahead for a top-level slash inside this group
				let depth = 0;
				let seenSlash = false;
				for (let i = pos; i < data.length; i++) {
					const p = data[i];
					if (depth === 0) {
						if (p === ')') break;
						if (p === '/') seenSlash = true;
						if (p === '(') depth++;
					} else {
						if (p === '(') depth++;
						else if (p === ')') depth--;
					}
				}
				slashStack.push(seenSlash);
				if (seenSlash) {
					itemStack.push(items);
					optionsStack.push({ kind: 'options', choices: [] });
					items = [];
					pointText = '';
				} else {
					pointText += '(';
				}
			} else if (c === '/' && slashStack.length) {
				flushPoint();
				optionsStack[optionsStack.length - 1].choices.push(items);
				items = [];
			} else if (c === ')') {
				if (slashStack.pop()) {
					flushPoint();
					const options = optionsStack.pop()!;
					options.choices.push(items);
					items = itemStack.pop()!;
					items.push(options);
					pointText = '';
				} else {
					pointText += ')';
				}
			} else if (c === '<') {
				items.push(point(pointText));
				if (carrierNum || hasContent(items)) route.push(carrierOf(carrierNum, cleanup(items)));
				state = 'carrier';
				carrierNum = '';
				pointText = '';
				items = [];
				itemStack.length = 0;
				slashStack.length = 0;
				optionsStack.length = 0;
			} else {
				pointText += c;
			}
		}
	}

	if (pointText) flushPoint();
	if (carrierNum || hasContent(items)) route.push(carrierOf(carrierNum, cleanup(items)));

	return route.length ? route : null;
}

/** Drop empty point artifacts (e.g. from a `)` directly before `<` or EOF). */
function cleanup(items: ViaItem[]): ViaItem[] {
	return items.filter((i) => i.kind === 'options' || i.code !== '');
}
