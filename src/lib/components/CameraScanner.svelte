<script lang="ts">
	import { onMount } from 'svelte';
	import { scanImageData } from '../input/barcode.ts';
	import { makeTicket } from '../tickets/parse.ts';
	import { store } from '../state/tickets.svelte.ts';

	let { onclose }: { onclose: () => void } = $props();

	let video = $state<HTMLVideoElement>();
	let error = $state<string | null>(null);
	let found = $state(false);
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;

	async function scanFrame() {
		if (!video || video.readyState < 2 || found) return;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		ctx.drawImage(video, 0, 0);
		const hits = await scanImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
		if (hits.length) {
			found = true;
			for (const hit of hits) store.add(makeTicket(hit.bytes, { kind: 'camera' }, hit.format));
			close();
		}
	}

	function close() {
		clearInterval(timer);
		stream?.getTracks().forEach((t) => t.stop());
		onclose();
	}

	onMount(() => {
		(async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
				});
				video!.srcObject = stream;
				await video!.play();
				timer = setInterval(scanFrame, 350);
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		})();
		return () => {
			clearInterval(timer);
			stream?.getTracks().forEach((t) => t.stop());
		};
	});
</script>

<div class="backdrop" role="dialog" aria-label="Camera barcode scanner">
	<div class="panel">
		{#if error}
			<p class="error">Camera unavailable: {error}</p>
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} playsinline muted></video>
			<div class="reticle" aria-hidden="true"></div>
			<p class="hint">Point at the Aztec / QR code</p>
		{/if}
		<button class="close" onclick={close}>Close</button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(10, 12, 18, 0.82);
		display: grid;
		place-items: center;
		z-index: 50;
	}
	.panel {
		position: relative;
		width: min(94vw, 640px);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
	}
	video {
		width: 100%;
		border-radius: var(--radius);
		background: #000;
	}
	.reticle {
		position: absolute;
		top: 50%;
		left: 50%;
		width: min(52vw, 300px);
		aspect-ratio: 1;
		transform: translate(-50%, -60%);
		border: 2px solid rgba(255, 255, 255, 0.75);
		border-radius: 8px;
		pointer-events: none;
		mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
		padding: 24px;
	}
	.hint {
		color: #eee;
		margin: 0;
		font-size: 0.9rem;
	}
	.error {
		color: #fbb;
		background: rgba(0, 0, 0, 0.5);
		padding: 1rem;
		border-radius: var(--radius);
	}
	.close {
		background: transparent;
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 999px;
		padding: 0.4rem 1.4rem;
	}
</style>
