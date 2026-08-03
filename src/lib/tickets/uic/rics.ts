/** Small subset of the RICS company register for issuer display names. */
const RICS_NAMES: Record<number, string> = {
	80: 'DB Fernverkehr AG',
	1080: 'DB Fernverkehr AG',
	3080: 'DB Regio AG',
	5080: 'DB Vertrieb GmbH',
	81: 'ÖBB',
	1181: 'ÖBB Personenverkehr AG',
	83: 'Trenitalia',
	1083: 'Trenitalia S.p.A.',
	84: 'NS',
	1084: 'NS International',
	1184: 'Nederlandse Spoorwegen',
	85: 'SBB',
	1085: 'SBB CFF FFS',
	1185: 'SBB CFF FFS',
	86: 'DSB',
	1186: 'DSB',
	87: 'SNCF',
	1187: 'SNCF Voyageurs',
	88: 'SNCB/NMBS',
	1088: 'SNCB/NMBS',
	1174: 'SJ AB',
	1179: 'PKP Intercity',
	1154: 'České dráhy',
	1156: 'ZSSK',
	1165: 'MÁV-START',
	10: 'VR (Finland)',
	1010: 'VR (Finland)',
	75: 'TCDD',
	1183: 'Trenitalia',
	1076: 'Norske tog / Entur',
	1251: 'Koleje Mazowieckie',
	3153: 'Snälltåget',
	3342: 'Schweizerische Südostbahn (SOB)',
	5008: 'Flix Train',
	5197: 'WESTbahn',
	5245: 'European Sleeper',
	9901: 'Eurail B.V. (Interrail)',
	9902: 'Eurail B.V.',
	3018: 'Transdev / Ostdeutsche Eisenbahn',
	3213: 'Hamburger Verkehrsverbund (HVV)',
	5262: 'FlixTrain GmbH'
};

export function ricsName(code: number | string | null | undefined): string | null {
	if (code === null || code === undefined) return null;
	const n = typeof code === 'string' ? parseInt(code, 10) : code;
	return RICS_NAMES[n] ?? null;
}
