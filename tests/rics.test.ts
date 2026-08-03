/**
 * RICS issuer names, now read from the bundled rics.json.
 *
 * The codes below are public company codes from the RICS register, not values
 * taken off anyone's ticket.
 */
import { describe, expect, it } from 'vitest';
import { ricsName } from '../src/lib/tickets/uic/rics.ts';
import ricsNames from '../src/lib/tickets/uic/rics.json' with { type: 'json' };

describe('rics.json', () => {
	it('is a flat map of decimal codes to names', () => {
		const entries = Object.entries(ricsNames);
		expect(entries.length).toBeGreaterThan(30);
		for (const [code, name] of entries) {
			expect(code, `key ${code}`).toMatch(/^\d+$/);
			expect(typeof name).toBe('string');
			expect(name.length).toBeGreaterThan(0);
		}
	});
});

describe('ricsName', () => {
	it('resolves codes the table knows', () => {
		expect(ricsName(80)).toBe('DB Fernverkehr AG');
		expect(ricsName(1181)).toBe('ÖBB Personenverkehr AG');
		expect(ricsName(1187)).toBe('SNCF Voyageurs');
		expect(ricsName(9901)).toBe('Eurail B.V. (Interrail)');
	});

	it('takes a string code, including one with leading zeros', () => {
		// U_HEAD writes the code as fixed-width digits
		expect(ricsName('80')).toBe('DB Fernverkehr AG');
		expect(ricsName('0080')).toBe('DB Fernverkehr AG');
		expect(ricsName('1187')).toBe('SNCF Voyageurs');
	});

	it('returns null rather than a placeholder for anything it does not know', () => {
		// callers render their own "RICS <n>" fallback
		expect(ricsName(4711)).toBeNull();
		expect(ricsName(null)).toBeNull();
		expect(ricsName(undefined)).toBeNull();
		expect(ricsName('')).toBeNull();
		expect(ricsName('not a code')).toBeNull();
	});
});
