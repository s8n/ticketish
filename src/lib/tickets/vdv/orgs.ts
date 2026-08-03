/**
 * VDV organisation names.
 *
 * There is no public register: the complete list lives behind an
 * authenticated third-party API. Every entry below is instead derived from a
 * source we can point at, noted per entry. Numeric IDs are shown as-is when
 * unknown, which is the common case.
 */

interface OrgEntry {
	name: string;
	/** Where the identification comes from. */
	source: string;
}

const ORGS: Record<number, OrgEntry> = {
	// Named in the NRW tariff specification published by KC Digitalisierung:
	// "die OrgID des VRS (102 dezimal)" and "KCM (6212 dezimal)".
	102: { name: 'Verkehrsverbund Rhein-Sieg (VRS)', source: 'KCD NRW tariff specification' },
	6212: { name: 'Kompetenzcenter Marketing NRW (KCM)', source: 'KCD NRW tariff specification' },

	// Derived from the vendored product tables, where each file covers one
	// association's tariff and contains exactly these organisation IDs.
	70: { name: 'Verkehrsverbund Rhein-Ruhr (VRR)', source: 'VRR product table' },
	77: { name: 'Westfalentarif', source: 'Westfalentarif product table' },
	6072: { name: 'Aachener Verkehrsverbund (AVV)', source: 'AVV product table' },
	6262: { name: 'Deutsche Bahn', source: 'DB product table' },
	6263: { name: 'Deutsche Bahn', source: 'DB product table' },
	39052: { name: 'IVU Traffic Technologies', source: 'IVU product table' },
	// The VVO tariff file covers these three; which operator each one is has
	// not been established, so they share the association's name.
	6013: { name: 'Verkehrsverbund Oberelbe (VVO)', source: 'VVO product table' },
	6060: { name: 'Verkehrsverbund Oberelbe (VVO)', source: 'VVO product table' },
	6068: { name: 'Verkehrsverbund Oberelbe (VVO)', source: 'VVO product table' },

	// Identified from sample tickets.
	6292: { name: 'MVG München', source: 'MVG ticket samples' }
};

export function vdvOrgName(code: number | undefined | null): string | null {
	if (code === undefined || code === null) return null;
	return ORGS[code]?.name ?? null;
}

/** Name plus the numeric ID, or just the ID when the name is unknown. */
export function vdvOrgLabel(code: number | undefined | null): string {
	if (code === undefined || code === null) return 'unknown';
	const name = vdvOrgName(code);
	return name ? `${name} (${code})` : `org ${code}`;
}

export function vdvOrgSource(code: number): string | undefined {
	return ORGS[code]?.source;
}
