// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * What colour a pass comes out.
 *
 * A wallet pass is recognised across a platform at arm's length, so the
 * operator's own colour does more work there than anywhere in this app: it is
 * what tells a DB ticket from an MVG one on a lock screen. Both wallets take a
 * background colour, so both get the same one and a pass looks like itself
 * whichever phone it ends up on.
 *
 * Operators are keyed by code, not by name. The issuer name on a ticket is
 * whatever the issuer felt like writing that year ("DB AG", "DB Fernverkehr
 * AG", "DB Vertrieb GmbH"), while the code beside it is the one the industry
 * agreed on, and one operator holding four codes is easier to write down than
 * four spellings.
 *
 * Adding an operator means adding its codes and its colour below, with a
 * source. A wrong brand colour is worse than none: the default palette says
 * "this came out of ticketish" honestly, where a nearly-right red says
 * "this came from DB" and is wrong.
 */

/** Apple takes rgb() triples, Google takes a hex string, so both are kept. */
export interface PassColors {
	/** "#rrggbb", which is what Google's hexBackgroundColor wants. */
	hex: string;
	/** "rgb(r, g, b)", which is what pass.json wants. */
	background: string;
	foreground: string;
	label: string;
}

/** Where the issuer's code came from, since the two numbering spaces overlap. */
export interface OperatorCode {
	scheme: 'rics' | 'vdv';
	code: number;
}

interface OperatorColor {
	name: string;
	/** Background, as "#rrggbb". */
	hex: string;
	/** How this colour was arrived at, so it can be checked or corrected. */
	source: string;
	/** UIC company codes this operator issues under. */
	rics?: number[];
	/** VDV organisation IDs. */
	vdv?: number[];
}

const OPERATORS: OperatorColor[] = [
	{
		name: 'Deutsche Bahn',
		hex: '#ee0020',
		source: 'specified for this app; DB publishes its own red as #ec0016',
		// 80 and 1080 are DB Fernverkehr, 3080 DB Regio, 5080 DB Vertrieb: one
		// operator to a passenger, four codes to the ticket
		rics: [80, 1080, 3080, 5080]
	}
];

/** The app's own palette, for every ticket whose operator is not in the list. */
const DEFAULT: PassColors = {
	hex: '#26324b',
	background: 'rgb(38, 50, 75)',
	foreground: 'rgb(247, 226, 198)',
	label: 'rgb(198, 174, 140)'
};

const CHANNELS = (hex: string): [number, number, number] => [
	parseInt(hex.slice(1, 3), 16),
	parseInt(hex.slice(3, 5), 16),
	parseInt(hex.slice(5, 7), 16)
];

/** WCAG relative luminance, which is what decides light text or dark. */
function luminance(hex: string): number {
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const [r, g, b] = CHANNELS(hex);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const rgb = ([r, g, b]: [number, number, number]) =>
	`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** `amount` of the way from one colour to another, for the label tone. */
function mix(
	from: [number, number, number],
	to: [number, number, number],
	amount: number
): [number, number, number] {
	return [
		from[0] + (to[0] - from[0]) * amount,
		from[1] + (to[1] - from[1]) * amount,
		from[2] + (to[2] - from[2]) * amount
	];
}

/**
 * A full palette from a background alone.
 *
 * Only the background is worth writing down per operator: the text on it
 * follows from how light it is, and a label that is the text colour mixed a
 * third of the way back into the background reads as secondary without
 * needing a third colour anybody has to choose. Google picks its own text
 * colour and ignores all of this, which is another reason not to hand-pick it.
 */
export function paletteFor(hex: string): PassColors {
	const background = CHANNELS(hex);
	const light = luminance(hex) < 0.45;
	const foreground: [number, number, number] = light ? [255, 255, 255] : [26, 26, 26];
	return {
		hex,
		background: rgb(background),
		foreground: rgb(foreground),
		label: rgb(mix(foreground, background, 0.35))
	};
}

/** The operator entry for a code, if the list knows it. */
function lookup(operator: OperatorCode | undefined): OperatorColor | undefined {
	if (!operator) return undefined;
	return OPERATORS.find((entry) =>
		(operator.scheme === 'rics' ? entry.rics : entry.vdv)?.includes(operator.code)
	);
}

/** The colours a pass for this operator should use. */
export function passColors(operator: OperatorCode | undefined): PassColors {
	const entry = lookup(operator);
	return entry ? paletteFor(entry.hex) : DEFAULT;
}

/** The operator's name as the colour list knows it, for tests and debugging. */
export function colouredOperatorName(operator: OperatorCode | undefined): string | null {
	return lookup(operator)?.name ?? null;
}
