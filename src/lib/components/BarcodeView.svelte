<script lang="ts">
	/**
	 * The payload re-encoded as a barcode. Drawn from the module grid as an SVG
	 * path rather than shown as the scanned image, so it stays sharp at any
	 * size and scans as well as the original did.
	 */
	import type { BarcodeSymbology } from '../tickets/types.ts';
	import { modulesToPath, renderBarcode, type RenderedBarcode } from '../input/render.ts';

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

	const path = $derived(result ? modulesToPath(result.modules) : '');
	const viewBox = $derived(
		result
			? `${-QUIET} ${-QUIET} ${result.modules.width + QUIET * 2} ${result.modules.height + QUIET * 2}`
			: '0 0 1 1'
	);
	// keep tall symbols from filling the card; PDF417 is very wide and short
	const wide = $derived(!!result && result.modules.width > result.modules.height * 2);

	const describe = (s: BarcodeSymbology | null | undefined) =>
		s
			? [s.format, s.version ? `version ${s.version}` : null, s.ecLevel ? `EC ${s.ecLevel}` : null]
					.filter(Boolean)
					.join(' · ')
			: '–';
</script>

<div class="barcode">
	{#if error}
		<p class="note">Could not re-encode this payload: {error}</p>
	{:else if !result}
		<p class="note">Encoding…</p>
	{:else}
		<div class="symbol" class:wide>
			<svg {viewBox} shape-rendering="crispEdges" role="img" aria-label={`${result.actual?.format ?? symbology.format} barcode`}>
				<rect x={-QUIET} y={-QUIET} width={result.modules.width + QUIET * 2} height={result.modules.height + QUIET * 2} fill="#fff" />
				<path d={path} fill="#000" />
			</svg>
		</div>

		<dl>
			<dt>Original</dt>
			<dd>{describe(symbology)}</dd>
			<dt>Re-encoded</dt>
			<dd>{describe(result.actual)}</dd>
			<dt>Modules</dt>
			<dd>{result.modules.width} × {result.modules.height}</dd>
			<dt>Payload</dt>
			<dd>{raw.length} bytes</dd>
		</dl>

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
		{:else if result.fidelity === 'unknown'}
			<p class="note">
				Same bytes, re-encoded rather than photographed. This format does not report the original
				symbol's size, so how closely the layout matches cannot be checked.
			</p>
		{:else}
			<p class="note">
				Same bytes, same symbology, same symbol size as the one that was scanned, so it scans
				wherever the original did. The module pattern itself may still differ: how an encoder
				packs the data is not recoverable from a decode.
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
		max-width: 100%;
	}
	.symbol svg {
		display: block;
		width: 15rem;
		max-width: 100%;
		height: auto;
	}
	.symbol.wide svg {
		width: 26rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.15rem 1rem;
		margin: 0;
		font-size: 0.88rem;
	}
	dt {
		color: var(--ink-soft);
	}
	dd {
		margin: 0;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-soft);
	}
	.note.warn {
		color: var(--signal-red);
	}
</style>
