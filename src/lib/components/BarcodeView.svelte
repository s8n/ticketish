<script lang="ts">
	// SPDX-FileCopyrightText: 2026 ave
	// SPDX-License-Identifier: MIT OR EUPL-1.2

	/**
	 * The payload re-encoded as a barcode. Drawn from the module grid as an SVG
	 * path rather than shown as the scanned image, so it stays sharp at any
	 * size and scans as well as the original did.
	 */
	import type { BarcodeSymbology } from '../tickets/types.ts';
	import {
		modulesToPath,
		modulesToRgba,
		renderBarcode,
		type RenderedBarcode
	} from '../input/render.ts';
	import RawView from './records/RawView.svelte';

	let { raw, symbology }: { raw: Uint8Array; symbology: BarcodeSymbology } = $props();

	let result = $state<RenderedBarcode | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		// re-run if the ticket in this card changes
		const [bytes, sym] = [raw, symbology];
		let current = true;
		result = null;
		error = null;
		renderBarcode(bytes, sym)
			.then((r) => current && (result = r))
			.catch((e) => current && (error = e instanceof Error ? e.message : String(e)));
		return () => {
			current = false;
		};
	});

	// four modules of white on every side, which is the usual quiet zone and
	// what a scanner needs to find the symbol at all
	const QUIET = 4;
	/** Pixels per module in the download, big enough to print or scan off glass. */
	const PNG_SCALE = 8;

	const path = $derived(result ? modulesToPath(result.modules) : '');
	const viewBox = $derived(
		result
			? `${-QUIET} ${-QUIET} ${result.modules.width + QUIET * 2} ${result.modules.height + QUIET * 2}`
			: '0 0 1 1'
	);
	// PDF417 is very wide and short; everything else the app reads is squarish.
	// Knowing this up front lets the box keep its size while the symbol encodes,
	// instead of the card collapsing and springing back.
	const wide = $derived(
		result ? result.modules.width > result.modules.height * 2 : symbology.format === 'PDF417'
	);

	const describe = (s: BarcodeSymbology | null | undefined) =>
		s
			? [s.format, s.version ? `version ${s.version}` : null, s.ecLevel ? `EC ${s.ecLevel}` : null]
					.filter(Boolean)
					.join(' · ')
			: '–';

	// what the not-yet-known rows say; an encode that failed is never coming
	const pending = $derived(error ? '–' : 'encoding…');

	function download() {
		if (!result) return;
		const name = `barcode-${(result.actual?.format ?? symbology.format).toLowerCase()}.png`;
		const { data, width, height } = modulesToRgba(result.modules, PNG_SCALE, QUIET);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.putImageData(new ImageData(data, width, height), 0, 0);
		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = name;
			a.click();
			// revoking in the same tick can cancel the download before it starts
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		}, 'image/png');
	}
</script>

<div class="barcode">
	{#if error}
		<p class="note warn">Could not re-encode this payload: {error}</p>
	{:else}
		<div class="symbol" class:wide>
			{#if result}
				<svg
					{viewBox}
					shape-rendering="crispEdges"
					role="img"
					aria-label={`${result.actual?.format ?? symbology.format} barcode`}
				>
					<rect
						x={-QUIET}
						y={-QUIET}
						width={result.modules.width + QUIET * 2}
						height={result.modules.height + QUIET * 2}
						fill="#fff"
					/>
					<path d={path} fill="#000" />
				</svg>
			{:else}
				<div class="placeholder">Encoding…</div>
			{/if}
		</div>

		<div class="actions">
			<button onclick={download} disabled={!result}>Download barcode</button>
		</div>
	{/if}

	<dl class="fields">
		<dt>Original</dt>
		<dd>{describe(symbology)}</dd>
		<dt>Re-encoded</dt>
		<dd>{result ? describe(result.actual) : pending}</dd>
		<dt>Modules</dt>
		<dd>{result ? `${result.modules.width} × ${result.modules.height}` : pending}</dd>
		<dt>Payload</dt>
		<dd>{raw.length} bytes</dd>
	</dl>

	{#if result}
		{#if result.fidelity === 'broken'}
			<p class="note warn">
				This symbol did not decode back to the payload it was made from, so do not rely on it. It
				is shown only because the encoding itself reported no error.
			</p>
		{:else if result.fidelity === 'resized'}
			<p class="note">
				Same bytes, but the symbol came out a different size than the one that was scanned, so it
				will not look like the original.
			</p>
		{/if}
		{#if result.actual?.ecLevel && result.actual.ecLevel !== symbology.ecLevel}
			<p class="note">
				The error correction figures differ because the decoder derives them from spare capacity
				rather than reading a setting, so two symbols of the same size holding the same bytes
				report different percentages.
			</p>
		{/if}
	{/if}

	<details class="rawtoggle readout">
		<summary>Raw payload ({raw.length} bytes)</summary>
		<RawView {raw} />
	</details>
</div>

<style>
	.barcode {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.symbol {
		background: #fff;
		border: 1px solid var(--paper-edge);
		border-radius: 4px;
		padding: 0.5rem;
		align-self: start;
		/* holds its size while encoding, so the card does not jump */
		box-sizing: border-box;
		width: 16rem;
		max-width: 100%;
	}
	.symbol.wide {
		width: 27rem;
	}
	.symbol svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.placeholder {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		color: #767676;
		font-size: 0.8rem;
	}
	.wide .placeholder {
		/* PDF417 with its quiet zone lands near 2.8:1 */
		aspect-ratio: 2.8 / 1;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.actions button {
		font-size: 0.82rem;
		padding: 0.35rem 0.9rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.note.warn {
		color: var(--signal-red);
	}
	.rawtoggle summary {
		font-size: 0.8rem;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.rawtoggle[open] summary {
		margin-bottom: 0.4rem;
	}
</style>
