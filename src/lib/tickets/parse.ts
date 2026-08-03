// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/** Entry point: classify and parse a scanned barcode payload. */
import type { BarcodeSymbology, ParsedTicket, TicketContainer, TicketSource } from './types.ts';
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
import { isHzpp, parseHzpp } from './hzpp/hzpp.ts';
import { isCdLegacy, parseCdLegacy } from './cd/legacy.ts';
import { isNsb, parseNsb } from './nsb/nsb.ts';
import { isSncfETicket, parseSncfETicket } from './sncf/eticket.ts';

// Record parsers register themselves on import.
import './records/uhead.ts';
import './records/utlay.ts';
import './records/uflex.ts';
import './records/dbbl.ts';
import './records/dbvu.ts';
import './records/oebb.ts';

export function parsePayload(data: Uint8Array): TicketContainer {
	if (isUic9183(data)) {
		return { kind: 'uic9183', envelope: parseUic9183(data) };
	}
	if (isRsp6(data)) {
		return { kind: 'rsp6', ticket: parseRsp6(data) };
	}
	if (isVdv(data)) {
		try {
			return { kind: 'vdv', barcode: parseVdv(data) };
		} catch {
			// fall through to the other formats
		}
	}
	if (isSsb(data)) {
		try {
			return { kind: 'ssb', envelope: parseSsb(data) };
		} catch {
			// fall through
		}
	}
	if (isSsb1(data)) {
		try {
			return { kind: 'ssb1', ticket: parseSsb1(data) };
		} catch {
			// fall through
		}
	}
	if (isTrenitalia(data)) {
		try {
			return { kind: 'trenitalia', ticket: parseTrenitalia(data) };
		} catch {
			// fall through
		}
	}
	if (isUz(data)) {
		try {
			return { kind: 'uz', ticket: parseUz(data) };
		} catch {
			// fall through
		}
	}
	if (isEav(data)) {
		try {
			return { kind: 'eav', ticket: parseEav(data) };
		} catch {
			// fall through
		}
	}
	if (isTcdd(data)) {
		try {
			return { kind: 'tcdd', ticket: parseTcdd(data) };
		} catch {
			// fall through
		}
	}
	if (isRenfe(data)) {
		try {
			return { kind: 'renfe', ticket: parseRenfe(data) };
		} catch {
			// fall through
		}
	}
	if (isMav(data)) {
		try {
			return { kind: 'mav', ticket: parseMav(data) };
		} catch {
			// fall through
		}
	}
	if (isNsb(data)) {
		try {
			return { kind: 'nsb', ticket: parseNsb(data) };
		} catch {
			// fall through
		}
	}
	if (isCdLegacy(data)) {
		try {
			return { kind: 'cd-legacy', ticket: parseCdLegacy(data) };
		} catch {
			// fall through
		}
	}
	if (isHzpp(data)) {
		try {
			return { kind: 'hzpp', ticket: parseHzpp(data) };
		} catch {
			// fall through
		}
	}
	if (isViaRail(data)) {
		try {
			return { kind: 'viarail', ticket: parseViaRail(data) };
		} catch {
			// fall through
		}
	}
	if (isElb(data)) {
		try {
			return { kind: 'elb', ticket: parseElb(data) };
		} catch {
			// fall through
		}
	}
	if (isSncfETicket(data)) {
		try {
			return { kind: 'sncf-eticket', ticket: parseSncfETicket(data) };
		} catch {
			// fall through
		}
	}
	try {
		return { kind: 'dosipas', envelope: parseDosipas(data) };
	} catch {
		// not DOSIPAS
	}
	try {
		return { kind: 'swisspass', ticket: parseSwissPass(data) };
	} catch {
		// not SwissPass
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
	if (b >= 0x20 && b <= 0x7e) return true; // ASCII printable
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
