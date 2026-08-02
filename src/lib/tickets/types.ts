/** Core data model shared by the parsing pipeline and the UI. */

/** A raw record inside a UIC 918.x envelope (or DOSIPAS data sequence). */
export interface RawRecord {
	id: string;
	version: number;
	data: Uint8Array;
	/** Some issuers encode record lengths in UTF-8 characters instead of bytes. */
	utf8Length?: boolean;
}

/** A record after running through the record-parser registry. */
export interface ParsedRecord {
	id: string;
	version: number;
	raw: Uint8Array;
	/** Registry key of the parser that handled it, e.g. 'flex', 'db-bl'. */
	kind: string;
	data: unknown;
	error?: string;
}

export interface Uic9183Envelope {
	envelopeVersion: number;
	issuerRics: number;
	keyId: string;
	signature: Uint8Array;
	/** zlib-compressed signed payload (signature covers this). */
	signedData: Uint8Array;
	records: ParsedRecord[];
}

export interface DosipasEnvelope {
	headerVersion: number;
	securityProvider: number | string | null;
	keyId: number | null;
	endOfValidity: string | null; // ISO datetime (UTC)
	validityDuration: number | null; // seconds
	records: ParsedRecord[];
}

export type TicketContainer =
	| { kind: 'uic9183'; envelope: Uic9183Envelope }
	| { kind: 'dosipas'; envelope: DosipasEnvelope }
	| { kind: 'rsp6'; ticket: import('./rsp/rsp6.ts').Rsp6Ticket }
	| { kind: 'swisspass'; ticket: import('./swisspass/swisspass.ts').SwissPassTicket }
	| { kind: 'vdv'; barcode: import('./vdv/vdv.ts').VdvBarcode }
	| { kind: 'ssb'; envelope: import('./ssb/ssb.ts').SsbEnvelope }
	| { kind: 'renfe'; ticket: import('./renfe/renfe.ts').RenfeTicket }
	| { kind: 'text'; text: string }
	| { kind: 'unknown' };

/** Where a scanned payload came from. */
export interface TicketSource {
	kind: 'image' | 'pdf' | 'pkpass' | 'camera' | 'raw';
	fileName?: string;
	/** Non-barcode context, e.g. Apple Wallet pass.json fields. */
	passInfo?: PkpassInfo;
}

export interface PkpassInfo {
	description?: string;
	organizationName?: string;
	style?: string;
	fields: { label?: string; key?: string; value: unknown }[];
}

export interface ParsedTicket {
	id: string;
	source: TicketSource;
	barcodeFormat?: string;
	raw: Uint8Array;
	container: TicketContainer;
	scannedAt: number;
}
