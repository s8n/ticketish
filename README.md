# ticketish

Reads what your train ticket really says. A fully client-side SvelteKit PWA
that decodes the 2D barcodes on European rail tickets - including the
deciphered **Zugbindung** (train binding) hidden in DB tickets.

Everything runs in the browser: no server, no uploads, works offline once
installed.

## What it reads

- **UIC 918.3** - the classic `#UT` Aztec envelope (U_HEAD, U_TLAY/RCT2
  layout, DB `0080BL` fare data, DB `0080VU` Verbund products)
- **UIC 918.9 / FCB** - `U_FLEX` records (FCB versions 1.3, 2 and 3), decoded
  with a from-scratch unaligned-PER (ASN.1 UPER) decoder
- **DOSIPAS** - the `U1`/`U2` dynamic barcode header carrying FCB payloads
  (e.g. Interrail passes)
- **UK RSP6** - National Rail tickets ("06") and railcards ("08"): base26
  RSA message recovery with the published RSP keys, then the bit-packed
  ticket record
- **SwissPass / NOVA** - Swiss mobile tickets (protobuf QR)
- **VDV-KA** - German Verbund tickets and the Deutschlandticket: BER-TLV
  envelope with ISO 9796-2 message recovery against the VDV CA certificates,
  including MOTICS copy-protection containers
- **SSB** - an older bit-packed UIC barcode still issued by some operators:
  reservations, travel tickets, group tickets, passes, and NS/DB Keycards
- **Renfe** - Spanish tickets, which use their own fixed-width ASCII format
  rather than a UIC one
- Anything else falls back to a plain-text / hex view

Inputs: images, PDFs (rendered with pdf.js and scanned), Apple Wallet
`.pkpass` files, live camera, raw payload files. Signatures are deliberately
**not** verified - this reads tickets, it doesn't judge them.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # parser tests against fixture barcodes
npm run check    # svelte-check
npm run build    # static site in build/
```

### Architecture

The parsing pipeline is modular by design:

- `src/lib/tickets/asn1/` - generic UPER decoder (`uper.ts`) driven by JSON
  schemas generated from the official UIC ASN.1 specs
  (`npm run gen:asn` regenerates them from `scripts/asn-specs/`).
- `src/lib/tickets/registry.ts` - record-parser registry. Each record type
  (U_HEAD, U_FLEX, 0080BL, …) registers itself; add a parser + a view
  component in `src/lib/components/records/` to support a new record type.
- `src/lib/tickets/model.ts` - FCB display model; resolves the day-offset
  date encoding and extracts `trainLink` entries - the Zugbindung.
- `src/lib/input/` - barcode extraction from images (zxing-wasm), PDFs
  (pdf.js), pkpass (fflate) and camera. All WASM/workers are bundled and
  served same-origin so the PWA works offline.

### Tests

`tests/` decodes real barcode payloads and compares the TypeScript UPER
decoder byte-for-byte against ground truth produced by Python `asn1tools`
from the same ASN.1 specs. Fixtures come from the official DB Muster tickets
(`tests/fixtures/public`, committed) and personal samples
(`tests/fixtures/private`, gitignored). Regenerate with
`scripts/extract-fixtures.py` (see its docstring).

**`static/samples/` ships with the site and must only ever contain the public
DB Muster specimens - never personal tickets.** `tests/samples-guard.test.ts`
enforces this.

## Deploying to Cloudflare Pages

The site is fully static (`@sveltejs/adapter-static`), so:

- **Build command:** `npm run build`
- **Output directory:** `build`

Either connect the repo in the Cloudflare Pages dashboard with those
settings, or deploy manually:

```sh
npm run build
npx wrangler pages deploy build
```

No functions, bindings or environment variables needed.

## Credits

- ASN.1 specifications © UIC, from
  [UIC-barcode](https://github.com/UnionInternationalCheminsdeFer/UIC-barcode)
  (EUPL-1.2 / Apache-2.0), vendored in `scripts/asn-specs/`.
- Format knowledge and record quirks studied from
  [zuegli](https://github.com/TheEnbyperor/zuegli) (EUPL-1.2), which also
  verifies signatures if you want the full treatment. The via-route parser,
  RSP6 bit layouts, and SwissPass protobuf schema are ports of its code.
- RSP6 public keys vendored from
  [eta's rsp6-decoder](https://git.eta.st/eta/rsp6-decoder) (MIT).
- VDV CA public keys are built from VDV KA's public LDAP directory by
  `scripts/build-vdv-keys.py`; a monthly GitHub Action refreshes them.
- UK station names come from the RDG/National Rail fares feed via
  `scripts/build-nlc-names.py`, also refreshed monthly. That feed needs a free
  National Rail Open Data account; the workflow reads the `NR_USERNAME` and
  `NR_PASSWORD` repository secrets and skips cleanly when they are absent.
- DB Leitpunktkürzel and Swiss NOVA organisation names derive from the
  respective operators' open data.
