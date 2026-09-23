// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * The one way into the zxing reader.
 *
 * Left to itself, zxing-wasm fetches its binary from a CDN, which fails
 * offline and tells a third party that somebody is reading a ticket. Pointing
 * it at the bundled copy has to happen before the first decode, whichever
 * code path gets there first, so every read goes through `readBarcodes` here
 * rather than the package's own. `tests/zxing-reader.test.ts` holds the rest
 * of `src/` to that.
 */
import { prepareZXingModule, readBarcodes as zxingRead } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let prepared = false;

function prepare() {
	if (prepared) return;
	prepared = true;
	// Outside a browser (tests) the bundler has not rewritten the URL into a
	// served asset, and the package finds the binary on disk by itself.
	if (typeof document === 'undefined') return;
	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) =>
				path.endsWith('.wasm') ? wasmUrl : prefix + path
		}
	});
}

export const readBarcodes: typeof zxingRead = (...args) => {
	prepare();
	return zxingRead(...args);
};
