<script lang="ts">
	import { onMount } from 'svelte';
	import { scanImageData, BINARIZERS } from '../input/barcode.ts';
	import { makeTicket } from '../tickets/parse.ts';
	import { store } from '../state/tickets.svelte.ts';

	let { onclose }: { onclose: () => void } = $props();

	let video = $state<HTMLVideoElement>();
	let error = $state<string | null>(null);
	let found = false;
	let running = false;
	let stream: MediaStream | null = null;

	// Reused between frames; allocating a canvas per frame is wasteful.
	let canvas: HTMLCanvasElement | undefined;
	let ctx: CanvasRenderingContext2D | null = null;

	async function scanFrame(binarizerIndex: number): Promise<boolean> {
		if (!video || video.readyState < 2 || !video.videoWidth) return false;
		canvas ??= document.createElement('canvas');
		if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			ctx = canvas.getContext('2d', { willReadFrequently: true });
		}
		if (!ctx) return false;
		ctx.drawImage(video, 0, 0);
		const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const hits = await scanImageData(image, BINARIZERS[binarizerIndex % BINARIZERS.length]);
		if (!hits.length) return false;
		for (const hit of hits) store.add(makeTicket(hit.bytes, { kind: 'camera' }, hit));
		return true;
	}

	/**
	 * Scan as fast as decoding allows rather than on a fixed timer, and vary
	 * the binarizer per frame so both lighting cases get a chance.
	 */
	async function loop() {
		let frame = 0;
		while (running && !found) {
			try {
				if (await scanFrame(frame++)) {
					found = true;
					close();
					return;
				}
			} catch {
				// a dropped frame is not worth stopping for
			}
			await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		}
	}

	function stop() {
		running = false;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	function close() {
		stop();
		onclose();
	}

	async function openCamera(): Promise<MediaStream> {
		const base: MediaTrackConstraints = {
			facingMode: 'environment',
			width: { ideal: 2560 },
			height: { ideal: 1440 }
		};
		try {
			// continuous autofocus matters a lot for dense Aztec codes
			return await navigator.mediaDevices.getUserMedia({
				video: { ...base, advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }
			});
		} catch {
			return navigator.mediaDevices.getUserMedia({ video: base });
		}
	}

	onMount(() => {
		(async () => {
			try {
				stream = await openCamera();
				video!.srcObject = stream;
				await video!.play();
				running = true;
				loop();
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		})();
		return stop;
	});
</script>

<div class="backdrop" role="dialog" aria-label="Camera barcode scanner">
	<div class="panel">
		{#if error}
			<p class="error">Camera unavailable: {error}</p>
		{:else}
			<!-- The viewport keeps its size before the stream arrives, so the
			     reticle has something to sit in and the hint is not pushed under it. -->
			<div class="viewport">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video bind:this={video} playsinline muted></video>
				<div class="reticle" aria-hidden="true"></div>
			</div>
			<p class="hint">Point at the barcode: Aztec, QR, PDF417 or Data Matrix</p>
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
	.viewport {
		position: relative;
		width: 100%;
		/* reserved up front: the reticle is min(52vw, 300px) plus its padding,
		   and the hint sits below the viewport rather than over the video */
		aspect-ratio: 4 / 3;
		min-height: min(58vh, 360px);
		max-height: 72vh;
		border-radius: var(--radius);
		background: #000;
		overflow: hidden;
	}
	video {
		width: 100%;
		height: 100%;
		/* the decoder reads the full frame off a canvas, not this element, so
		   cropping the preview to fill the box costs nothing */
		object-fit: cover;
		display: block;
	}
	.reticle {
		position: absolute;
		top: 50%;
		left: 50%;
		width: min(52vw, 300px);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
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
