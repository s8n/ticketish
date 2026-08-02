/** DB 0080BL record — Bahn "Leipzig" block with S-field key/values. Port of zuegli's parser. */
import { registerRecordParser } from '../registry.ts';
import type { RawRecord } from '../types.ts';

export interface DbBlCert {
	validFrom: string;
	validTo: string;
	id?: string;
}

export interface DbBlData {
	ticketType: string;
	certs: DbBlCert[];
	product: string | null;
	productClass: 'A' | 'B' | 'C' | null;
	fromStationName: string | null;
	toStationName: string | null;
	fromStationUic: number | null;
	toStationUic: number | null;
	returnFromStationName: string | null;
	returnToStationName: string | null;
	route: string | null;
	validityStart: string | null;
	validityEnd: string | null;
	travellerForename: string | null;
	travellerSurname: string | null;
	travellerFullName: string | null;
	numTravellers: number;
	numAdults: number;
	numChildren: number;
	numBahncards: number;
	bahncardType: string | null;
	serviceClass: 'first' | 'second' | null;
	priceLevel: string | null;
	paymentCard: string | null;
	blocks: Record<string, string>;
}

const utf8 = new TextDecoder('utf-8');

function dmyToIso(s: string): string | null {
	const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseDbBl(record: RawRecord): DbBlData {
	const d = record.data;
	const version = record.version;
	const ticketType = utf8.decode(d.subarray(0, 2));
	const numBlocks = parseInt(utf8.decode(d.subarray(2, 3)), 10);
	let off = 3;
	const certs: DbBlCert[] = [];
	const dmyCompact = (s: Uint8Array) => {
		const t = utf8.decode(s);
		return `${t.slice(4, 8)}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
	};
	if (version === 3) {
		for (let i = 0; i < numBlocks; i++) {
			certs.push({
				validFrom: dmyCompact(d.subarray(off, off + 8)),
				validTo: dmyCompact(d.subarray(off + 8, off + 16)),
				id: utf8.decode(d.subarray(off + 16, off + 26)).trim()
			});
			off += 26;
		}
	} else if (version === 2) {
		for (let i = 0; i < numBlocks; i++) {
			certs.push({
				validFrom: dmyCompact(d.subarray(off + 22, off + 30)),
				validTo: dmyCompact(d.subarray(off + 30, off + 38))
			});
			off += 46;
		}
	} else {
		throw new Error(`unsupported 0080BL version ${version}`);
	}

	const out: DbBlData = {
		ticketType,
		certs,
		product: null,
		productClass: null,
		fromStationName: null,
		toStationName: null,
		fromStationUic: null,
		toStationUic: null,
		returnFromStationName: null,
		returnToStationName: null,
		route: null,
		validityStart: null,
		validityEnd: null,
		travellerForename: null,
		travellerSurname: null,
		travellerFullName: null,
		numTravellers: 0,
		numAdults: 0,
		numChildren: 0,
		numBahncards: 0,
		bahncardType: null,
		serviceClass: null,
		priceLevel: null,
		paymentCard: null,
		blocks: {}
	};

	const numSub = parseInt(utf8.decode(d.subarray(off, off + 2)), 10);
	off += 2;
	for (let i = 0; i < numSub; i++) {
		const blockId = utf8.decode(d.subarray(off, off + 4));
		const blockLen = parseInt(utf8.decode(d.subarray(off + 4, off + 8)), 10);
		const value = utf8.decode(d.subarray(off + 8, off + 8 + blockLen));
		off += 8 + blockLen;

		switch (blockId) {
			case 'S001':
				out.product = value;
				break;
			case 'S002':
				out.productClass = ({ '0': 'C', '1': 'B', '2': 'A' } as const)[value] ?? null;
				break;
			case 'S009': {
				const [adults, bahncards, bcType] = value.split('-');
				out.numAdults = parseInt(adults, 10) || 0;
				out.numBahncards = parseInt(bahncards, 10) || 0;
				if (['19', '78'].includes(bcType)) out.bahncardType = 'BC50';
				else if (['49', '27', '39'].includes(bcType)) out.bahncardType = 'BC25';
				break;
			}
			case 'S012':
				out.numChildren = parseInt(value, 10) || 0;
				break;
			case 'S014':
				out.serviceClass = value === 'S1' ? 'first' : value === 'S2' ? 'second' : null;
				break;
			case 'S015':
				out.fromStationName = value;
				break;
			case 'S016':
				out.toStationName = value;
				break;
			case 'S017':
				out.returnFromStationName = value;
				break;
			case 'S018':
				out.returnToStationName = value;
				break;
			case 'S021':
				out.route = value;
				break;
			case 'S023':
				out.travellerFullName = value;
				break;
			case 'S026':
				out.priceLevel =
					({ '12': 'Normalpreis', '13': 'Sparpreis', '3': 'Rail&Fly' } as Record<string, string>)[
						value
					] ?? value;
				break;
			case 'S027':
				out.paymentCard = value;
				break;
			case 'S028': {
				const [forename, surname] = value.split('#');
				out.travellerForename = forename ?? null;
				out.travellerSurname = surname ?? null;
				break;
			}
			case 'S031':
				out.validityStart = dmyToIso(value);
				break;
			case 'S032':
				out.validityEnd = dmyToIso(value);
				break;
			case 'S035':
				out.fromStationUic = 8000000 + parseInt(value, 10);
				break;
			case 'S036':
				out.toStationUic = 8000000 + parseInt(value, 10);
				break;
			case 'S040':
				out.numTravellers = parseInt(value, 10) || 0;
				break;
			default:
				out.blocks[blockId] = value;
		}
	}
	return out;
}

registerRecordParser({
	kind: 'db-bl',
	matches: (id) => id === '0080BL',
	parse: parseDbBl
});
