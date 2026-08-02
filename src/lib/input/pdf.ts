/** Render PDF pages with pdf.js and scan each page image for barcodes. */
import { scanImageData, type BarcodeHit } from './barcode.ts';

export async function scanPdf(data: ArrayBuffer): Promise<BarcodeHit[]> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const doc = await pdfjs.getDocument({ data }).promise;
	const hits: BarcodeHit[] = [];
	const seen = new Set<string>();
	try {
		for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
			const page = await doc.getPage(pageNum);
			// ~300 dpi; cap dimensions to keep memory sane on large pages
			let viewport = page.getViewport({ scale: 300 / 72 });
			const maxDim = 5000;
			if (viewport.width > maxDim || viewport.height > maxDim) {
				const scale = (300 / 72) * Math.min(maxDim / viewport.width, maxDim / viewport.height);
				viewport = page.getViewport({ scale });
			}
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
			for (const hit of await scanImageData(image)) {
				const key = `${hit.format}:${[...hit.bytes].join(',')}`;
				if (!seen.has(key)) {
					seen.add(key);
					hits.push(hit);
				}
			}
		}
	} finally {
		await doc.destroy();
	}
	return hits;
}
