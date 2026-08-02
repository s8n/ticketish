/**
 * SSB barcodes (the older bit-packed UIC format still used for e.g. NS
 * Keycards). 114+ bytes: a bit-packed header and body, with the trailing 56
 * bytes carrying the signature.
 *
 * Layouts ported from zuegli's main/ssb (EUPL-1.2).
 */

export interface SsbEnvelope {
	version: number;
	issuerRics: number;
	keyId: number;
	ticketType: number;
	ticketTypeName: string;
	data: SsbKeycard | null;
	/** Set when the ticket type has no dedicated parser yet. */
	unsupported?: string;
	bodyHex: string;
}

export interface SsbKeycard {
	kind: 'ns-keycard';
	version: number;
	cardId: string;
	numAdults: number;
	numChildren: number;
	specimen: boolean;
	travelClass: number;
	extraText: string;
	stationUic: number;
	issuingDate: string;
	validityStart: string;
	validityEnd: string;
	numTravelDays: number;
	productCode: number;
	productName: string;
}

class Bits {
	constructor(private d: Uint8Array) {}
	bit(i: number): number {
		return (this.d[i >> 3] >> (7 - (i & 7))) & 1;
	}
	bool(i: number): boolean {
		return this.bit(i) === 1;
	}
	int(start: number, end: number): number {
		let v = 0;
		for (let i = start; i < end; i++) v = v * 2 + this.bit(i);
		return v;
	}
	/** 6-bit characters offset by 0x20 */
	str(start: number, end: number): string {
		let s = '';
		for (let i = start; i < end; i += 6) s += String.fromCharCode(this.int(i, i + 6) + 0x20);
		return s.trim();
	}
	slice(start: number): Bits {
		// re-pack from a bit offset
		const bitLen = this.d.length * 8 - start;
		const out = new Uint8Array(Math.ceil(bitLen / 8));
		for (let i = 0; i < bitLen; i++) {
			if (this.bit(start + i)) out[i >> 3] |= 0x80 >> (i & 7);
		}
		return new Bits(out);
	}
	get bytes(): Uint8Array {
		return this.d;
	}
}

const NS_PRODUCTS: Record<number, string> = {
	1: 'Keycard',
	2: 'Jaarpas passage',
	3: 'Kwartaalpas passage',
	4: 'Dagpas',
	5: 'Dagpas groep',
	6: 'Preprinted ATB',
	7: 'Uitstel van Betaling',
	8: 'Meereiskaart Spoordeelweken',
	9: 'Landencoupon',
	12: 'Thalys Employee Pass',
	14: 'Eurail Pass Cover',
	15: 'Interrail Pass Cover',
	16: 'Boekenweekgeschenk',
	17: 'Dagpas Speciaal',
	18: 'Keycard Speciaal',
	19: 'Weekend passage',
	20: 'Charter Dagpas RPR',
	21: 'NMBS Trainkaarten',
	25: 'Exit recht',
	26: 'Evenement',
	27: 'Maandpas passage',
	28: 'Halfjaarpas passage',
	29: 'Dagpas groep (dynamisch)',
	30: 'Weekpas',
	33: 'Dagpas avond'
};

const TICKET_TYPE_NAMES: Record<number, string> = {
	1: 'Integrated reservation ticket',
	2: 'Non-reservation ticket',
	3: 'Group ticket',
	4: 'Pass',
	21: 'NS Keycard'
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * SSB stores only the last digit of the year; resolve it to the most recent
 * matching year that is not in the future.
 */
function resolveYear(digit: number, now: Date): number {
	let year = Math.floor(now.getUTCFullYear() / 10) * 10 + digit;
	if (Date.UTC(year, 0, 1) > now.getTime()) year -= 10;
	return year;
}

function parseKeycard(d: Bits, now: Date): SsbKeycard {
	const year = resolveYear(d.int(105, 109), now);
	const issuingDay = d.int(109, 118);
	const issuing = new Date(Date.UTC(year, 0, 1));
	issuing.setUTCDate(issuing.getUTCDate() + issuingDay - 1);

	const validityStart = new Date(issuing);
	validityStart.setUTCDate(validityStart.getUTCDate() + d.int(129, 138));
	const validityEnd = new Date(issuing);
	validityEnd.setUTCDate(validityEnd.getUTCDate() + d.int(138, 150));

	const stationId = d.int(367, 384);
	const productCode = d.int(118, 125);

	return {
		kind: 'ns-keycard',
		version: d.int(125, 129),
		cardId: d.str(21, 105),
		numAdults: d.int(0, 7),
		numChildren: d.int(7, 14),
		// the flag is inverted here compared to other SSB ticket types
		specimen: !d.bool(14),
		travelClass: d.int(15, 21),
		extraText: d.str(157, 367),
		stationUic: stationId ? 8400000 + stationId : 0,
		issuingDate: isoDate(issuing),
		validityStart: isoDate(validityStart),
		validityEnd: isoDate(validityEnd),
		numTravelDays: d.int(150, 157),
		productCode,
		productName: NS_PRODUCTS[productCode] ?? `Product ${productCode}`
	};
}

export function isSsb(data: Uint8Array): boolean {
	if (data.length < 114) return false;
	const version = (data[0] >> 4) & 0x0f;
	return version === 2 || version === 3;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export function parseSsb(data: Uint8Array, now: Date = new Date()): SsbEnvelope {
	if (!isSsb(data)) throw new Error('not an SSB barcode');
	const signatureOffset = data.length - 56;
	const d = new Bits(data.subarray(0, signatureOffset));

	const version = d.int(0, 4);
	const issuerRics = d.int(4, 18);
	const keyId = d.int(18, 22);
	const ticketType = d.int(22, 27);
	const body = d.slice(27);

	const envelope: SsbEnvelope = {
		version,
		issuerRics,
		keyId,
		ticketType,
		ticketTypeName: TICKET_TYPE_NAMES[ticketType] ?? `Type ${ticketType}`,
		data: null,
		bodyHex: hex(body.bytes)
	};

	// NS (RICS 1184) uses ticket type 21 for Keycards.
	if (issuerRics === 1184 && ticketType === 21) {
		envelope.data = parseKeycard(body, now);
	} else {
		envelope.unsupported = `SSB ticket type ${ticketType} is not decoded yet`;
	}

	return envelope;
}
