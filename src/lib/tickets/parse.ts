/** Entry point: classify and parse a scanned barcode payload. */
import type { ParsedTicket, TicketContainer, TicketSource } from './types.ts';
import { isUic9183, parseUic9183 } from './uic/envelope9183.ts';
import { parseDosipas } from './uic/dosipas.ts';
import { isRsp6, parseRsp6 } from './rsp/rsp6.ts';
import { parseSwissPass } from './swisspass/swisspass.ts';

// Record parsers register themselves on import.
import './records/uhead.ts';
import './records/utlay.ts';
import './records/uflex.ts';
import './records/dbbl.ts';
import './records/dbvu.ts';

export function parsePayload(data: Uint8Array): TicketContainer {
	if (isUic9183(data)) {
		return { kind: 'uic9183', envelope: parseUic9183(data) };
	}
	if (isRsp6(data)) {
		return { kind: 'rsp6', ticket: parseRsp6(data) };
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

function tryText(data: Uint8Array): string | null {
	if (data.length === 0) return null;
	try {
		const s = new TextDecoder('utf-8', { fatal: true }).decode(data);
		// Require mostly printable characters
		const printable = [...s].filter((c) => c >= ' ' || c === '\n' || c === '\t' || c === '\r');
		return printable.length / [...s].length > 0.95 ? s : null;
	} catch {
		return null;
	}
}

let counter = 0;

export function makeTicket(
	data: Uint8Array,
	source: TicketSource,
	barcodeFormat?: string
): ParsedTicket {
	return {
		id: `t${Date.now()}-${counter++}`,
		source,
		barcodeFormat,
		raw: data,
		container: parsePayload(data),
		scannedAt: Date.now()
	};
}
