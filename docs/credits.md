# Credits

Many formats here were learned from somebody: a published specification, a
project that had already taken the format apart, or a table of names nobody
else publishes. Those sources are listed below, with the conditions some of
them came with, and with the one whose conditions nobody has been able to
establish.

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
- **Swiss Geschäftsorganisation numbers**, which a SwissPass ticket names its
  seller and its zones by, come from the business organisations dataset the
  **Geschäftsstelle Systemaufgaben Kundeninformation (SKI)** publishes as Open
  Data on behalf of the BAV at
  [opentransportdata.swiss](https://opentransportdata.swiss/), via
  `scripts/build-nova-orgs.py`, refreshed monthly and needing no credentials.
  The [terms of use](https://opentransportdata.swiss/de/terms-of-use/) want the
  source named, which is *opentransportdata.swiss* and travels in the `_note`
  inside the JSON, and they want the data kept current with its source, which
  is why the monthly refresh is part of the obligation rather than a
  convenience. Modified from the original: of twenty-three columns the
  organisation number, the German name and abbreviation and the end of
  validity are kept, and an organisation with several validity windows is
  reduced to the row that runs latest.
- **Organisation Codes** in `src/lib/tickets/uic/era-orgs.json` come from the
  Organisation Code Register published by the **European Union Agency for
  Railways** at [teleref.era.europa.eu](https://teleref.era.europa.eu/), via
  `scripts/build-era-orgs.py`, refreshed monthly and needing no credentials.
  Since January 2026 UIC allocates RICS codes only outside the EU and ERA
  allocates Organisation Codes inside it, in the same numbering: an operator
  that held a RICS code kept the value. So this is the register behind the
  hand curated names in `rics.json`, thousands of entries deep. ERA's
  [copyright notice](https://www.era.europa.eu/content/disclaimer-and-copyright-notice)
  authorises reproduction provided the source is acknowledged, which is the
  whole of the obligation and travels in the `_note` inside the JSON: *source,
  European Union Agency for Railways*. What is taken is modified from the
  original, which is worth stating either way: of fifteen columns only the
  code, the organisation name, its acronym and the country are kept, the
  country as a two letter code rather than the name the column holds, and the
  codes ERA has revoked are folded in from the export's second sheet with the
  revocation written into the name. The address, email, phone and role columns are left
  where they are, since no ticket needs them and ERA's
  [Terms of Use](https://teleref.era.europa.eu/termsOfUsage-OCR-v1.0.pdf)
  treat the contact details as personal data.
- The other half of the same numbering is the **RICS register** published by
  the **International Union of Railways** at
  [uic.org](https://www.uic.org/support-activities/it/rics?recherche=rics),
  which is where a company code came from before ERA took the EU allocations
  over, and where the codes outside the EU still come from. UIC publishes it as
  a PDF and grants no reuse licence over it, so it is not vendored here. ERA's
  export marks each row as an Organisation Code or a RICS code, so the mirrored
  RICS ones are split out of the same download into
  `src/lib/tickets/uic/rics.json`, under ERA's terms and with ERA's credit. A
  code the register does not mirror is added by hand in
  `scripts/rics-era-overrides.json`, one at a time and with a source, which is
  where 1284 comes from. Whether ERA keeps mirroring UIC's allocations after
  the transition period is not settled, and the railways outside the EU are
  where the two registers would diverge first.

## Tables with strings attached

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
built by `scripts/build-uic-benerail-from-trainline.py` and refreshed monthly with no
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

**IATA airline designators** in `src/lib/tickets/data/airlines.json` come from
[npow/airline-codes](https://github.com/npow/airline-codes), which republishes
the [OpenFlights](https://openflights.org/data.php) airline database, built by
`scripts/build-airlines.py` and refreshed monthly with no credentials. **The
ISC licence on that package covers its code, not the data.** OpenFlights
publishes under the **Open Data Commons Open Database License (ODbL) 1.0**,
with the contents under the Database Contents License, and asks that you
acknowledge the source and license public derived works freely. This table is
a derived database, so both go with it: keep the `_note` and keep it under
ODbL if you redistribute it.

Designators get reused, so only the ones held by exactly one airline
OpenFlights marks as active are here. Two live airlines share LH and SQ with
their cargo arms; the script declines to choose and `bcbp/codes.ts` names them
in its `OVERRIDES` map instead.

**IATA airport codes** in `src/lib/tickets/data/airports.json` come from
[datasets/airport-codes](https://github.com/datasets/airport-codes), which
tidies the nightly [OurAirports](https://ourairports.com/data/) export and
republishes it under the **Open Data Commons Public Domain Dedication and
Licence (PDDL) 1.0**, built by `scripts/build-airports.py` alongside the
airlines. PDDL is a dedication rather than a licence, so nothing has to travel
with this one; the credit is kept anyway, because a table nobody can trace is
a table nobody can check.

## One table whose terms are unsettled

**The rest of the UIC station names**, in
`src/lib/tickets/data/plc-stations.json`, come from the **UIC Primary Location
Code** register, which RailNetEurope keeps for UIC in the Central Reference
File Database. Trainline's catalogue covers the stations Trainline sells to,
which left Poland with 141 stations of 4,670 and Croatia with 14 of 566, so a
Croatian or Hungarian ticket showed numbers where names belong. This fills the
countries where that happens and nothing else.

**Its terms are the least settled of anything here.** UIC's own ENEE database
closed in 2019, the CRD that replaced it sits behind an account, and no reuse
licence for the register has been identified. It is included because a station
name on a ticket is a fact the passenger is already holding, and it is kept to
the minimum that serves that: names and codes, no coordinates, flags, validity
dates or infrastructure managers, and only for the thin countries. It is one
file and one loader, so if the terms turn out to forbid this, removing it is a
small change rather than an unpicking. Anyone redistributing ticketish should
know it is here.
