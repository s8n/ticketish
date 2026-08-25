// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Entry point: classify and parse a scanned barcode payload. */
import type { BarcodeSymbology, ParsedTicket, TicketContainer, TicketSource } from './types.ts';
import { isPrintableAsciiByte } from './bytes.ts';
import { isUic9183, parseUic9183 } from './uic/envelope9183.ts';
import { parseDosipas } from './uic/dosipas.ts';
import { isRsp6, parseRsp6 } from './rsp/rsp6.ts';
import { parseSwissPass } from './swisspass/swisspass.ts';
import { isVdv, parseVdv } from './vdv/vdv.ts';
import { isSsb, parseSsb } from './ssb/ssb.ts';
import { isRenfe, parseRenfe } from './renfe/renfe.ts';
import { isSsb1, parseSsb1 } from './ssb/ssb1.ts';
import { isTcdd, parseTcdd } from './tcdd/tcdd.ts';
import { isTrenitalia, parseTrenitalia } from './trenitalia/trenitalia.ts';
import { isEav, parseEav } from './eav/eav.ts';
import { isUz, parseUz } from './uz/uz.ts';
import { isElb, parseElb } from './elb/elb.ts';
import { isMav, parseMav } from './mav/mav.ts';
import { isViaRail, parseViaRail } from './viarail/viarail.ts';
import { isBcbp, parseBcbp } from './bcbp/bcbp.ts';
import { isHzpp, parseHzpp } from './hzpp/hzpp.ts';
import { isCdLegacy, parseCdLegacy } from './cd/legacy.ts';
import { isNsb, parseNsb } from './nsb/nsb.ts';
import { isBob, parseBob } from './bob/bob.ts';
import { isSncfETicket, parseSncfETicket } from './sncf/eticket.ts';

// Record parsers register themselves on import.
import './records/uhead.ts';
import './records/utlay.ts';
import './records/uflex.ts';
import './records/dbbl.ts';
import './records/dbvu.ts';
import './records/oebb.ts';

interface Detector {
	/**
	 * Cheap test for whether the payload is this format at all. Omitted by the
	 * two formats that have no magic to look for and can only be identified by
	 * parsing them, which is why they come last.
	 */
	matches?: (data: Uint8Array) => boolean;
	parse: (data: Uint8Array) => TicketContainer;
	/**
	 * Set where a match settles it, so a parse failure is an error worth
	 * raising rather than a reason to go on looking. Everything else falls
	 * through to the next detector, since these tests are heuristics and a
	 * payload that trips one can still belong to another format.
	 */
	certain?: boolean;
}

/**
 * The formats, in the order they are tried, which is the order they resolve
 * each other's ambiguities in. Adding one means adding a line here and a kind
 * to TicketContainer; nothing else dispatches on the format.
 */
const DETECTORS: Detector[] = [
	{ matches: isUic9183, parse: (d) => ({ kind: 'uic9183', envelope: parseUic9183(d) }), certain: true },
	{ matches: isRsp6, parse: (d) => ({ kind: 'rsp6', ticket: parseRsp6(d) }), certain: true },
	{ matches: isVdv, parse: (d) => ({ kind: 'vdv', barcode: parseVdv(d) }) },
	{ matches: isSsb, parse: (d) => ({ kind: 'ssb', envelope: parseSsb(d) }) },
	{ matches: isSsb1, parse: (d) => ({ kind: 'ssb1', ticket: parseSsb1(d) }) },
	{ matches: isTrenitalia, parse: (d) => ({ kind: 'trenitalia', ticket: parseTrenitalia(d) }) },
	{ matches: isUz, parse: (d) => ({ kind: 'uz', ticket: parseUz(d) }) },
	{ matches: isEav, parse: (d) => ({ kind: 'eav', ticket: parseEav(d) }) },
	{ matches: isTcdd, parse: (d) => ({ kind: 'tcdd', ticket: parseTcdd(d) }) },
	{ matches: isRenfe, parse: (d) => ({ kind: 'renfe', ticket: parseRenfe(d) }) },
	{ matches: isMav, parse: (d) => ({ kind: 'mav', ticket: parseMav(d) }) },
	{ matches: isNsb, parse: (d) => ({ kind: 'nsb', ticket: parseNsb(d) }) },
	{ matches: isBob, parse: (d) => ({ kind: 'bob', ticket: parseBob(d) }), certain: true },
	{ matches: isCdLegacy, parse: (d) => ({ kind: 'cd-legacy', ticket: parseCdLegacy(d) }) },
	{ matches: isHzpp, parse: (d) => ({ kind: 'hzpp', ticket: parseHzpp(d) }) },
	{ matches: isViaRail, parse: (d) => ({ kind: 'viarail', ticket: parseViaRail(d) }) },
	{ matches: isBcbp, parse: (d) => ({ kind: 'bcbp', ticket: parseBcbp(d) }) },
	{ matches: isElb, parse: (d) => ({ kind: 'elb', ticket: parseElb(d) }) },
	{ matches: isSncfETicket, parse: (d) => ({ kind: 'sncf-eticket', ticket: parseSncfETicket(d) }) },
	{ parse: (d) => ({ kind: 'dosipas', envelope: parseDosipas(d) }) },
	{ parse: (d) => ({ kind: 'swisspass', ticket: parseSwissPass(d) }) }
];

export function parsePayload(data: Uint8Array): TicketContainer {
	for (const { matches, parse, certain } of DETECTORS) {
		if (matches && !matches(data)) continue;
		if (certain) return parse(data);
		try {
			return parse(data);
		} catch {
			// not this format after all, so try the next
		}
	}
	const text = tryText(data);
	if (text !== null) return { kind: 'text', text };
	return { kind: 'unknown' };
}

/**
 * Text QRs are not all UTF-8. Portuguese CP tickets carry the operator's own
 * address, and it is ISO-8859-1: a strict UTF-8 decode throws on the ç in
 * "Calçada", which used to leave the whole payload showing as unidentified
 * binary.
 *
 * The printability test runs on the bytes rather than on the decoded string,
 * for a reason worth knowing. Labelling a decoder "iso-8859-1" gets you
 * windows-1252, because that is what the WHATWG encoding standard maps the
 * label to, and windows-1252 fills 0x80 to 0x9f with quotes and dashes
 * instead of leaving them as controls. So a run of 0x85 decodes to a line of
 * ellipses and reads as perfectly good text. Checking the bytes keeps that
 * range out, which matters because it is a quarter of what binary is made
 * of, and Latin-1 has no invalid byte to fail on the way UTF-8 does.
 */
function isTextByte(b: number): boolean {
	if (b === 0x09 || b === 0x0a || b === 0x0d) return true; // tab, newline
	if (isPrintableAsciiByte(b)) return true;
	return b >= 0xa0; // Latin-1's upper half, skipping the C1 controls
}

function tryText(data: Uint8Array): string | null {
	if (data.length === 0) return null;

	// UTF-8 first, since it rejects anything that is not, and most text
	// barcodes are written in it.
	try {
		const s = new TextDecoder('utf-8', { fatal: true }).decode(data);
		const printable = [...s].filter((c) => c >= ' ' || c === '\n' || c === '\r' || c === '\t');
		if (printable.length / [...s].length > 0.95) return s;
	} catch {
		// not UTF-8, so try the other encoding a text barcode is written in
	}

	let printable = 0;
	for (const b of data) if (isTextByte(b)) printable++;
	if (printable / data.length <= 0.95) return null;
	return new TextDecoder('iso-8859-1').decode(data);
}

let counter = 0;

export function makeTicket(
	data: Uint8Array,
	source: TicketSource,
	symbology?: BarcodeSymbology
): ParsedTicket {
	return {
		id: `t${Date.now()}-${counter++}`,
		source,
		symbology,
		raw: data,
		container: parsePayload(data),
		scannedAt: Date.now()
	};
}
