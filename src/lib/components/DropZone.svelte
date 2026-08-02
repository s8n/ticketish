<script lang="ts">
	import { ingestFile } from '../input/ingest.ts';
	import { store } from '../state/tickets.svelte.ts';

	let { busy = $bindable(false) }: { busy?: boolean } = $props();
	let dragging = $state(false);
	let fileInput: HTMLInputElement;

	async function handleFiles(files: FileList | File[] | null) {
		if (!files || busy) return;
		busy = true;
		try {
			for (const file of files) {
				const { tickets, errors } = await ingestFile(file);
				tickets.forEach((t) => store.add(t));
				store.addErrors(errors);
			}
		} finally {
			busy = false;
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}

	function onPaste(e: ClipboardEvent) {
		const files = [...(e.clipboardData?.files ?? [])];
		if (files.length) handleFiles(files);
	}
</script>

<svelte:window onpaste={onPaste} />

<button
	class="dropzone"
	class:dragging
	disabled={busy}
	onclick={() => fileInput.click()}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<span class="glyph" aria-hidden="true">
		<svg viewBox="0 0 40 28" width="46" height="32">
			<rect x="1" y="1" width="38" height="26" rx="3" fill="none" stroke="currentcolor" stroke-width="2" stroke-dasharray="4 3" />
			<rect x="7" y="7" width="14" height="14" fill="currentcolor" opacity="0.85" />
			<rect x="10" y="10" width="8" height="8" fill="var(--bg)" />
			<rect x="12.5" y="12.5" width="3" height="3" fill="currentcolor" />
			<rect x="25" y="7" width="9" height="2.5" fill="currentcolor" opacity="0.5" />
			<rect x="25" y="12" width="9" height="2.5" fill="currentcolor" opacity="0.5" />
			<rect x="25" y="17" width="6" height="2.5" fill="currentcolor" opacity="0.5" />
		</svg>
	</span>
	<span class="label">
		{#if busy}Reading…{:else}Drop a ticket here — image, PDF or .pkpass{/if}
	</span>
	<span class="hint">or click to choose a file · paste works too</span>
</button>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept="image/*,.pdf,.pkpass,.bin,application/pdf,application/vnd.apple.pkpass"
	onchange={(e) => {
		handleFiles(e.currentTarget.files);
		e.currentTarget.value = '';
	}}
	hidden
/>

<style>
	.dropzone {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 2.2rem 1rem;
		border: 2px dashed var(--hairline);
		border-radius: var(--radius);
		background: transparent;
		color: var(--bg-text);
		transition: border-color 0.15s, background 0.15s;
	}
	.dropzone:hover,
	.dropzone.dragging {
		border-color: var(--rail-blue);
		background: color-mix(in srgb, var(--rail-blue) 6%, transparent);
	}
	.dropzone:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.glyph {
		color: var(--bg-text-soft);
	}
	.label {
		font-weight: 500;
	}
	.hint {
		font-size: 0.82rem;
		color: var(--bg-text-soft);
	}
</style>
