<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	import type { EauCertificate } from '../tickets/kbv/eau.ts';
	import { READS_VERSION } from '../tickets/kbv/eau.ts';
	import { fmtDate } from '../tickets/format.ts';
	import SimpleTicketView from './SimpleTicketView.svelte';

	let { certificate }: { certificate: EauCertificate } = $props();

	/** Null rather than the placeholder, so an absent date drops its row. */
	const day = (value: string | null) => (value ? fmtDate(value) : null);

	/**
	 * Erst and Folge are exclusive, and either may carry End beside it to say
	 * the absence ends on the date given rather than running on.
	 */
	const title = $derived.by(() => {
		const kind = certificate.initial ? 'Initial' : certificate.followUp ? 'Follow-up' : null;
		if (kind && certificate.final) return `${kind} and final certificate`;
		if (kind) return `${kind} certificate`;
		if (certificate.final) return 'Final certificate';
		return 'Certificate of incapacity for work';
	});

	/** The tick boxes, named only where they are set. */
	const marks = $derived(
		(
			[
				[certificate.workAccident, 'work accident or occupational disease'],
				[certificate.referredToDArzt, 'referred to a Durchgangsarzt'],
				[certificate.otherAccident, 'other accident'],
				[certificate.bvg, 'BVG (state compensation)'],
				[certificate.rehabilitation, 'rehabilitation'],
				[certificate.reintegration, 'phased reintegration'],
				[certificate.sickPayCase, 'likely to reach the seventh week']
			] as [boolean, string][]
		)
			.filter(([set]) => set)
			.map(([, label]) => label)
			.join(' · ')
	);

	const diagnoses = $derived(
		certificate.diagnoses
			.map((d) => [d.code, d.certainty, d.laterality, ...d.unread].filter(Boolean).join(' '))
			.join(', ')
	);

	const rows = $derived<[string, string | null | undefined][]>([
		['Unfit for work since', day(certificate.unfitSince)],
		['Expected until', day(certificate.unfitUntil)],
		['Assessed on', day(certificate.assessedOn)],
		['Issued', day(certificate.issuedOn)],
		['Diagnoses', diagnoses],
		['Note on the diagnosis', certificate.diagnosisNote],
		['Marked', marks],
		['Other measures', certificate.otherMeasures],
		['Insurance number', certificate.insuredId],
		['Payer (IK)', certificate.payerId],
		['Insured type', certificate.insuredType],
		['Special person group', certificate.personGroup],
		['DMP', certificate.dmp],
		['Cover ends', day(certificate.coverageEnd)],
		['Practice (BSNR)', certificate.bsnr],
		['Doctor (LANR)', certificate.lanr],
		['Barcode version', String(certificate.version)],
		['Past the table', certificate.extraFields.join(' | ') || null]
	]);

	const note = $derived(
		'This barcode is on the Krankenkasse copy of a German sick note, which a practice prints and posts only when sending the eAU to the insurer electronically fails. It carries the diagnosis, which the patient\'s copy also prints and the employer\'s copy leaves out. Insured type, person group and DMP are shown as issued, since the specification lists the permitted codes but not what they stand for.' +
			(certificate.version > READS_VERSION
				? ` The barcode says version ${certificate.version} and is read against version ${READS_VERSION}, the published field table.`
				: '')
	);
</script>

<SimpleTicketView {title} {rows} {note} />
