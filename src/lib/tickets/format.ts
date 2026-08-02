/** Display formatting helpers (German locale conventions, de-DE dates). */

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return '–';
	const [date, time] = iso.split('T');
	const [y, m, d] = date.split('-');
	if (!y || !m || !d) return iso;
	return time ? `${d}.${m}.${y} ${time}` : `${d}.${m}.${y}`;
}

export function fmtPrice(cents: number | undefined, currency = 'EUR', fract = 2): string | null {
	if (cents === undefined) return null;
	const value = cents / 10 ** fract;
	return `${value.toLocaleString('de-DE', { minimumFractionDigits: fract })} ${currency}`;
}

export function fmtClass(classCode: string | undefined): string | null {
	if (!classCode) return null;
	if (classCode === 'notApplicable') return null;
	const map: Record<string, string> = { first: '1st class', second: '2nd class' };
	return map[classCode] ?? classCode;
}

export function hexDump(bytes: Uint8Array): string {
	const lines: string[] = [];
	for (let off = 0; off < bytes.length; off += 16) {
		const chunk = [...bytes.subarray(off, off + 16)];
		const hex = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ');
		const asc = chunk.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
		lines.push(`${off.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${asc}`);
	}
	return lines.join('\n');
}

/** Human labels for FCB document choice names. */
export function docTypeLabel(type: string): string {
	const map: Record<string, string> = {
		openTicket: 'Open ticket',
		reservation: 'Reservation',
		pass: 'Pass',
		customerCard: 'Customer card',
		carCarriageReservation: 'Car carriage reservation',
		voucher: 'Voucher',
		counterMark: 'Countermark',
		parkingGround: 'Parking',
		fipTicket: 'FIP ticket',
		stationPassage: 'Station passage',
		delayConfirmation: 'Delay confirmation',
		extension: 'Extension'
	};
	return map[type] ?? type;
}
