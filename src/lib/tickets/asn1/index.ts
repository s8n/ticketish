import { decodeUper, type AsnSchema } from './uper.ts';
import fcb1 from './schemas/fcb1.json' with { type: 'json' };
import fcb2 from './schemas/fcb2.json' with { type: 'json' };
import fcb3 from './schemas/fcb3.json' with { type: 'json' };
import header1 from './schemas/header1.json' with { type: 'json' };
import header2 from './schemas/header2.json' with { type: 'json' };

const FCB_SCHEMAS: Record<number, AsnSchema> = {
	// U_FLEX record version "01" and "13" both mean FCB 1.3
	1: fcb1 as AsnSchema,
	13: fcb1 as AsnSchema,
	2: fcb2 as AsnSchema,
	3: fcb3 as AsnSchema
};

export function decodeFcb(version: number, data: Uint8Array): unknown {
	const schema = FCB_SCHEMAS[version];
	if (!schema) throw new Error(`unsupported FCB version ${version}`);
	return decodeUper(schema, data);
}

export function decodeBarcodeHeader(data: Uint8Array): { version: number; header: unknown } {
	let lastError: unknown;
	for (const [version, schema] of [
		[2, header2],
		[1, header1]
	] as [number, AsnSchema][]) {
		try {
			const header = decodeUper(schema, data) as { format?: string };
			if (header.format === `U${version}`) return { version, header };
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError ?? new Error('not a DOSIPAS barcode');
}

export { decodeUper, type AsnSchema, type Choice } from './uper.ts';
