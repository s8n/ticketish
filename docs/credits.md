# Credits

Many formats here were learned from somebody: a published specification, a
project that had already taken the format apart, or a table of names nobody
else publishes. Those sources are listed below, with the conditions two of them
came with.

The rest had none of that and were reverse engineered here, barcode held
against the ticket it came off, field by field until the numbers stopped
moving. Several of them are written down nowhere else.

## Specifications and format knowledge

- ASN.1 specifications **© Union Internationale des Chemins de fer**, from
  [UIC-barcode](https://github.com/UnionInternationalCheminsdeFer/UIC-barcode),
  licensed EUPL-1.2 or Apache-2.0 at your choice and vendored in
  `scripts/asn-specs/` with their licence text. The schemas in
  `src/lib/tickets/asn1/schemas/` are generated from them, ship inside this
  app, and are derived works under the same terms.
- Format knowledge and record quirks studied from
  [zuegli](https://github.com/TheEnbyperor/zuegli) (EUPL-1.2), which also
  verifies signatures if you want the full treatment. The via-route parser,
  RSP6 bit layouts, and SwissPass protobuf schema are ports of its code.
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
  ticket medium enum and version dependent validity width from Volker Krause's
  branch of it. The VIA Rail layout follows its `viarail/viarail.ksy`.

## Keys and lookup tables

- RSP6 public keys vendored from
  [eta's rsp6-decoder](https://git.eta.st/eta/rsp6-decoder) (MIT).
- VDV CA public keys are built from VDV KA's public LDAP directory by
  `scripts/build-vdv-keys.py`; a monthly GitHub Action refreshes them. VDV
  product names are vendored from zuegli's tariff data (see
  `scripts/vdv-products/`) and merged by `scripts/build-vdv-products.py`.
- UK station names come from the RDG/National Rail fares feed via
  `scripts/build-nlc-names.py`, also refreshed monthly. That feed needs a free
  National Rail Open Data account; the workflow reads the `NR_USERNAME` and
  `NR_PASSWORD` repository secrets and skips cleanly when they are absent.
- Turkish station names come from the list TCDD's own e-ticket site reads, via
  `scripts/build-tcdd-stations.py`, refreshed monthly and needing no
  credentials. It covers the newer barcode layout; the older layout's 9 digit
  ids belong to a retired backend that no longer serves a list.
- Spanish station names come from the **Estaciones. Listado completo** dataset
  published by **Renfe Operadora** at
  [data.renfe.com](https://data.renfe.com/dataset/estaciones-listado-completo)
  under **Creative Commons Attribution 4.0**, via
  `scripts/build-renfe-stations.py`, refreshed monthly and needing no
  credentials. Attribution is the whole of the licence and it travels in the
  `_note` inside `src/lib/tickets/renfe/stations.json`: *Origen de los datos:
  Renfe Operadora*. The table is modified from the original, which CC BY asks
  to be stated: only the code and the name are kept, and the names are left in
  the upper case Renfe issues them in. Renfe's codes are neither UIC nor Adif
  numbers, so this is the only table that reads a Renfe barcode's stations.
- **DB Leitpunktkürzel**, the route points a Via text is written in, are read
  out of part 6 of DB's **Entfernungswerk**, the distance tables published with
  the Deutschlandtarif price list and linked from
  [bahn.de/agb](https://www.bahn.de/agb), by
  `scripts/build-db-leitpunkte.py`, refreshed monthly and needing no
  credentials. That is a tariff publication and not a licensed open data set,
  so what is taken from it is the abbreviation and the station it stands for
  and nothing else: not the distance tables, not the IBNR or Verbund columns
  printed beside them. A new edition lands each December and the JSON records
  which one it was built from.
- Swiss NOVA organisation names derive from the operator's open data.

## Two tables with strings attached

**VDV organisation names** in `src/lib/tickets/vdv/orgs.json` are the table
compiled by the **KCD+eTicketinfo** Android app, used here with attribution and
rebuilt by `scripts/build-vdv-orgs.py`. No public register of these IDs exists;
the complete list sits behind an authenticated API. **That app's licence
applies to this table.** It is not public-domain reference data and is not
cleared for commercial reuse: ticketish is a free tool for rail enthusiasts,
and anyone repackaging it commercially should strip `orgs.json` or clear it
with the app's authors first. A handful of entries where this repo has a better
source, or a correction to a typo, override it from `orgs.ts`.

**UIC station names and Benerail five letter mnemonics** both come from
[trainline-eu/stations](https://github.com/trainline-eu/stations), a single CSV
published under the **Open Data Commons Open Database License (ODbL) 1.0**,
built by `scripts/build-station-names.py` and refreshed monthly with no
credentials. The two tables it produces are a derived database, so the
attribution and the licence go with them: keep the `_note` in
`src/lib/tickets/data/uic-stations.json` and `benerail-stations.json`, and keep
them under ODbL if you redistribute them. SNCF's own open data publishes UIC
codes and the three letter TVS code but not the mnemonic, so this is the only
open source for `FRPST` and friends.

The mnemonics come from the CSV's `benerail_id` column, which is what SNCF
e-billets and ELB barcodes carry, and not from the `sncf_id` column beside it.
They agree on most stations and disagree on 237, mostly German, so the wrong
one names the wrong station in the place a correct answer would go.
