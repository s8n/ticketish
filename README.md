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
- **UK RSP6** - National Rail tickets ("06"): base26 RSA message recovery
  with the published RSP keys, then the bit-packed ticket record. Railcards
  ("08") are a separate standard; the parser has a layout for them but no
  sample to verify it against, so the card says so when one turns up
- **SwissPass / NOVA** - Swiss mobile tickets (protobuf QR)
- **VDV-KA** - German Verbund tickets and the Deutschlandticket: BER-TLV
  envelope with ISO 9796-2 message recovery against the VDV CA certificates,
  including MOTICS copy-protection containers
- **SSB and SSB1** - older bit-packed UIC barcodes still issued by some
  operators: reservations, travel tickets, group tickets, passes, and NS/DB
  Keycards, plus the 107-byte SSB1 variant used by VR (Finland)
- **Renfe** - Spanish tickets, which use their own fixed-width ASCII format
  rather than a UIC one
- **ELB (Element List Barcode)** - the fixed-width record specified in ERA TAP
  TSI technical document B.12 section 8, defined by SNCF for ATB printers and
  issued on Eurostar home print (`eRIV`, `eRIZ`) and SNCF card stock (`eEDV`)
  as both PDF417 and Aztec. 85 characters for a one-leg trip and 121 for an
  out and back: PNR, ticket number, both station mnemonics, per leg train,
  coach, seat, class and tariff, plus the specimen flag, ticket sequence,
  passenger counts, and the issue, validity and departure dates. Some issuers
  append a seal the specification does not describe
- **SNCF e-billet** - magic `i0CV`, a 131 character Aztec on TGV INOUI and
  sncf-connect tickets, unrelated to ELB despite the shared stock. Adds
  passenger name, date of birth and customer reference, and carries a travel
  date with no year, but has no coach or seat even when the ticket prints
  them. Ported from zuegli
- **MÁV** - Hungarian tickets, versions 2 to 6: a short plaintext head, a gzip
  compressed body of counted blocks (traveler, trip, supplements, seat
  reservations, passes) and an appended signature. Aztec and PDF417 alike.
  Station ids are UIC codes up to version 4, which the bundled table names,
  and MÁV's own numbering from version 5, which it cannot
- **VIA Rail** - Canadian boarding passes, a 124 character fixed-width ASCII
  Aztec carrying everything the pass prints and nothing more: no compression,
  no signature. Stations are VIA's own four letter codes and the timestamps
  are bare local time, both shown as issued
- **HŽPP** - Croatian tickets. The plaintext form (`B1`, 33 pipe separated
  fields) is read in full: ticket type, both legs with their trains and
  seats, passenger categories, validity and price, in kuna or euro depending
  on which side of the 2023 switchover it was sold. The encrypted form (`A1`)
  is recognised but cannot be opened, since HŽPP does not publish the key, so
  the card says so instead of showing a hex string
- **TCDD** - Turkish e-tickets, a "$"-delimited ASCII record
- **Trenitalia** - departure date, train, coach, seat, PNR and entitlement
  number, reverse engineered from four tickets; the payload appears to carry
  no departure time or station codes
- **EAV / UNICO Campania** - a plain text QR, one field per line

- Anything else falls back to a plain-text / hex view

Formats without a public specification were reverse engineered by comparing
barcodes against the printed tickets they came from. Where fields remain
unknown, the UI says so rather than guessing.

Inputs: images, PDFs (rendered with pdf.js and scanned), Apple Wallet
`.pkpass` files, live camera, raw payload files. Signatures are deliberately
**not** verified, that requires quite some additional data and logic, and is
best left to [zügli](https://zügli.app).

## The barcode tab

Every ticket gets a **Barcode** tab that re-encodes the payload and draws it
as vector modules, rather than showing the image it was scanned from. It can
be downloaded as a PNG, and the raw payload is there behind a toggle. The
bytes always come back exactly, non-UTF-8 payloads included, and the symbol
is decoded again before it is shown, so the tab can say how close it got:

- **Aztec** and **QR** come back at the original symbol size. The reader
  reports the Aztec layer count, which maps onto the writer's version
  numbering, and QR's L/M/Q/H is a setting the writer honours directly
- **PDF417** and **DataMatrix** are written at the encoder's own defaults,
  since the original's column count and size index are not recoverable

The tab never claims the pattern is module for module identical: how an
encoder segments its data is not recoverable from a decode. The error
correction figures shown usually differ, because the decoder derives them
from spare capacity instead of reading a setting.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # parser tests against synthetic barcodes
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
- `src/lib/tickets/stations.ts` - station names for the two identifier spaces
  tickets use, seven digit UIC codes and SNCF's five letter mnemonics. Both
  tables load on demand, and the raw code shows until they do.
- `src/lib/input/` - barcode extraction from images (zxing-wasm), PDFs
  (pdf.js), pkpass (fflate) and camera. All WASM/workers are bundled and
  served same-origin so the PWA works offline.

### Tests

Tests build their own payloads: bit writers, TLV and envelope builders, and
throwaway RSA keys for the formats that hide their data inside a signature
(see `tests/helpers/`). Real tickets are never used. The one exception is
`tests/fixtures/public`, DB's published Muster specimens, which the UPER
decoder is compared against byte for byte using ground truth generated by
Python `asn1tools` from the same ASN.1 specs (`scripts/extract-fixtures.py`).

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
- VDV product names are vendored from zuegli's tariff data (see
  `scripts/vdv-products/`) and merged by `scripts/build-vdv-products.py`.
- VDV **organisation** names in `src/lib/tickets/vdv/orgs.json` are the table
  compiled by the **KCD+eTicketinfo** Android app, used here with attribution
  and rebuilt by `scripts/build-vdv-orgs.py`. No public register of these IDs
  exists; the complete list sits behind an authenticated API. **That
  app's licence applies to this table.** It is not public-domain reference
  data and is not cleared for commercial reuse: ticketish is a free tool for
  rail enthusiasts, and anyone repackaging it commercially should strip
  `orgs.json` or clear it with the app's authors first. A handful of entries
  where this repo has a better source, or a correction to a typo, override it
  from `orgs.ts`.
- UK station names come from the RDG/National Rail fares feed via
  `scripts/build-nlc-names.py`, also refreshed monthly. That feed needs a free
  National Rail Open Data account; the workflow reads the `NR_USERNAME` and
  `NR_PASSWORD` repository secrets and skips cleanly when they are absent.
- Turkish station names come from the list TCDD's own e-ticket site reads,
  via `scripts/build-tcdd-stations.py`, refreshed monthly and needing no
  credentials. It covers the ids used by the newer barcode layout; the older
  layout's 9 digit ids belong to a retired backend that no longer serves a
  list.
- UIC station names and SNCF five letter mnemonics both come from
  [trainline-eu/stations](https://github.com/trainline-eu/stations), a single
  CSV published under the **Open Data Commons Open Database License (ODbL)
  1.0**, built by `scripts/build-station-names.py` and refreshed monthly with
  no credentials. The two tables it produces are a derived database, so the
  attribution and the licence go with them: keep the `_note` in
  `src/lib/tickets/data/uic-stations.json` and `sncf-stations.json`, and keep
  them under ODbL if you redistribute them. SNCF's own open data publishes UIC
  codes and the three letter TVS code but not the mnemonic, so this is the
  only open source for `FRPST` and friends.
- ELB is specified in **ERA TAP TSI technical document B.12** section 8
  (ERA-REC-122/TD/02), published by the European Union Agency for Railways.
  The parser here predates the discovery of that document; B.12 confirmed its
  offsets and named the fields it had not placed.
- The SNCF e-billet layout is a port of zuegli's, corroborated field for field
  by [trainticket.wiki](https://trainticket.wiki/ticket-standards/domestic-standards/france/)
  and [train-barcode-kaitai-spec](https://github.com/NeoRail/train-barcode-kaitai-spec)
  (MIT), which between them settled the Latin-1 encoding and the constant at
  offset 19.
- The MÁV layout follows the same project's `mav/mav.ksy` (CC0), plus the
  ticket medium enum and version dependent validity width from Volker
  Krause's branch of it. The VIA Rail layout follows its `viarail/viarail.ksy`.
- DB Leitpunktkürzel and Swiss NOVA organisation names derive from the
  respective operators' open data.
