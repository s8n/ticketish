/** Apple Wallet .pkpass: a zip with pass.json carrying the barcode message. */
import { unzipSync, strFromU8 } from 'fflate';
import type { PkpassInfo } from '../tickets/types.ts';
import type { BarcodeHit } from './barcode.ts';

interface PassBarcode {
	message: string;
	format?: string;
	messageEncoding?: string;
}

interface PassJson {
	description?: string;
	organizationName?: string;
	barcode?: PassBarcode;
	barcodes?: PassBarcode[];
	boardingPass?: PassStyle;
	eventTicket?: PassStyle;
	coupon?: PassStyle;
	generic?: PassStyle;
	storeCard?: PassStyle;
}

interface PassField {
	label?: string;
	key?: string;
	value: unknown;
}

interface PassStyle {
	headerFields?: PassField[];
	primaryFields?: PassField[];
	secondaryFields?: PassField[];
	auxiliaryFields?: PassField[];
	backFields?: PassField[];
}

/** pass.json messages are strings of bytes; latin1 keeps them byte-exact. */
function encodeMessage(message: string, encoding?: string): Uint8Array {
	const enc = (encoding ?? 'iso-8859-1').toLowerCase();
	if (enc === 'utf-8' || enc === 'utf8') return new TextEncoder().encode(message);
	const out = new Uint8Array(message.length);
	for (let i = 0; i < message.length; i++) out[i] = message.charCodeAt(i) & 0xff;
	return out;
}

export interface PkpassResult {
	hits: BarcodeHit[];
	info: PkpassInfo;
}

export function readPkpass(data: Uint8Array): PkpassResult {
	const files = unzipSync(data, { filter: (f) => f.name === 'pass.json' });
	const passFile = files['pass.json'];
	if (!passFile) throw new Error('pkpass has no pass.json');
	const pass = JSON.parse(strFromU8(passFile)) as PassJson;

	const barcodes = pass.barcodes ?? (pass.barcode ? [pass.barcode] : []);
	const hits = barcodes.map((b) => ({
		format: b.format?.replace('PKBarcodeFormat', '') ?? 'unknown',
		bytes: encodeMessage(b.message, b.messageEncoding)
	}));

	const style =
		pass.boardingPass ?? pass.eventTicket ?? pass.coupon ?? pass.storeCard ?? pass.generic;
	const styleName = pass.boardingPass
		? 'boardingPass'
		: pass.eventTicket
			? 'eventTicket'
			: pass.coupon
				? 'coupon'
				: pass.storeCard
					? 'storeCard'
					: pass.generic
						? 'generic'
						: undefined;
	const fields = [
		...(style?.headerFields ?? []),
		...(style?.primaryFields ?? []),
		...(style?.secondaryFields ?? []),
		...(style?.auxiliaryFields ?? []),
		...(style?.backFields ?? [])
	];

	return {
		hits,
		info: {
			description: pass.description,
			organizationName: pass.organizationName,
			style: styleName,
			fields
		}
	};
}
