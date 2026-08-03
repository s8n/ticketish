/** File ingestion: sniff type, extract barcode payload(s), parse tickets. */
import { makeTicket } from '../tickets/parse.ts';
import type { ParsedTicket, TicketSource } from '../tickets/types.ts';
import { scanBlob, type BarcodeHit } from './barcode.ts';
import { readPkpass } from './pkpass.ts';

export interface IngestResult {
	tickets: ParsedTicket[];
	errors: string[];
}

function sniff(bytes: Uint8Array, file: File): 'pdf' | 'zip' | 'image' | 'unknown' {
	if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'; // PK - pkpass
	if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))
		return 'image';
	if (/\.pdf$/i.test(file.name)) return 'pdf';
	if (/\.pkpass$/i.test(file.name)) return 'zip';
	return 'unknown';
}

export async function ingestFile(file: File): Promise<IngestResult> {
	const buf = await file.arrayBuffer();
	const bytes = new Uint8Array(buf);
	const kind = sniff(bytes, file);
	const errors: string[] = [];
	const tickets: ParsedTicket[] = [];

	const add = (hits: BarcodeHit[], source: TicketSource) => {
		for (const hit of hits) tickets.push(makeTicket(hit.bytes, source, hit));
	};

	try {
		if (kind === 'pdf') {
			const { scanPdf } = await import('./pdf.ts');
			const hits = await scanPdf(buf);
			if (hits.length === 0) errors.push(`No barcode found in ${file.name}`);
			add(hits, { kind: 'pdf', fileName: file.name });
		} else if (kind === 'zip') {
			const { hits, info } = readPkpass(bytes);
			if (hits.length === 0) errors.push(`No barcode in ${file.name}`);
			add(hits, { kind: 'pkpass', fileName: file.name, passInfo: info });
		} else if (kind === 'image') {
			const hits = await scanBlob(file);
			if (hits.length === 0) errors.push(`No barcode found in ${file.name}`);
			add(hits, { kind: 'image', fileName: file.name });
		} else {
			// Last resort: try to parse the file itself as a raw payload
			tickets.push(makeTicket(bytes, { kind: 'raw', fileName: file.name }));
		}
	} catch (e) {
		errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
	}

	return { tickets, errors };
}
