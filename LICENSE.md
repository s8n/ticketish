# Licensing

Code in this repository is dual licensed: you may use it under the MIT licence
reproduced at the bottom of this file, **or** under the European Union Public
Licence v1.2, at your option. Take whichever suits you; you do not have to
satisfy both.

The exceptions are listed below, and they are all files that either port
someone else's work or bundle someone else's data.

Every code file states its own terms in an SPDX header, so `MIT OR EUPL-1.2`
or `EUPL-1.2` at the top of a file is the answer for that file. This document
covers the data files too, which are JSON and cannot carry a comment.

## Code ported from zuegli (EUPL-1.2)

[zuegli](https://github.com/TheEnbyperor/zuegli) is EUPL-1.2, and MIT is not on
the EUPL's compatibility list, so the files ported from it are EUPL-1.2 only:

- `src/lib/tickets/via.ts` (from `parse_via.py`, © Q)
- `src/lib/tickets/records/dbbl.ts` (0080BL parser)
- `src/lib/tickets/sncf/eticket.ts` (from `main/sncf/data.py`)
- `src/lib/tickets/rsp/rsp6.ts` (bit layouts, from `main/rsp/data.py`)
- `src/lib/tickets/ssb/ssb.ts` (layouts, from `main/ssb`)
- `src/lib/tickets/ssb/ssb1.ts` (layout, from `main/ssb1`)
- `src/lib/tickets/vdv/vdv.ts` (structures, from `main/vdv`)
- `src/lib/tickets/hzpp/hzpp.ts` (from `main/hzpp/data.py`)
- `src/lib/tickets/swisspass/swisspass.ts` (protobuf schema reverse engineered
  by zuegli in `main/swisspass/swisspass.proto`; the wire reader here is ours)

Two other files cite zuegli without porting it: `src/lib/tickets/records/utlay.ts`
credits its observation about issuers that 1-index the column field, and
`src/lib/tickets/uic/envelope9183.ts` uses the same heuristic it does. Those are
observations about ticket data rather than code, so they fall under the dual
licence above, which means anyone who reads them differently can still take
them under EUPL-1.2.

## Vendored specifications

- `scripts/asn-specs/*.asn` are the official UIC ASN.1 specifications,
  © Union Internationale des Chemins de fer, licensed EUPL-1.2 (or later) or
  Apache-2.0 at your choice. See `scripts/asn-specs/LICENSE-UIC.txt`.
- `src/lib/tickets/asn1/schemas/*.json` are generated from those specs by
  `npm run gen:asn` and are derived works of them, under the same terms.

## Data with a known licence

- `src/lib/tickets/data/uic-stations.json` and
  `src/lib/tickets/data/sncf-stations.json` are derived from
  [trainline-eu/stations](https://github.com/trainline-eu/stations), which is
  published under the Open Database License (ODbL) 1.0. They are derived
  databases: keep the attribution and keep them under ODbL.
- `src/lib/tickets/rsp/keys.json` holds the UK RSP6 public keys, vendored from
  [eta's rsp6-decoder](https://git.eta.st/eta/rsp6-decoder), which is MIT.
- `scripts/vdv-products/productids_*.json` are vendored from zuegli
  (`main/vdv/data/products/`, EUPL-1.2), where they were compiled from the
  published tariff data of the respective German transport associations. The
  merged `src/lib/tickets/vdv/products.json` is EUPL-1.2 for the same reason.
  The one exception is `scripts/vdv-products/productids_ticketish.json`, which
  is ours: MIT or ODbL, at your option.
- `src/lib/tickets/swisspass/orgs.json` holds the Swiss Geschäftsorganisation
  numbers, built from the business organisations dataset published as Open Data
  on [opentransportdata.swiss](https://opentransportdata.swiss/) by the
  Geschäftsstelle SKI. Its
  [terms of use](https://opentransportdata.swiss/de/terms-of-use/) ask for
  opentransportdata.swiss to be named as the source of the raw data, which
  travels in the file's `_note`, for anything derived to be published under our
  own name, and for the data to be kept up to date with its source, which is
  what the monthly workflow is for. No share-alike and no restriction on use,
  so the compilation here is ours: MIT or ODbL, at your option.
- `src/lib/tickets/uic/rics.json` holds the RICS codes, which UIC allocates and
  ERA mirrors. It is built from the same ERA export as `era-orgs.json` below,
  from the rows the register marks as RICS codes, and carries the same
  acknowledgement. On top of it goes `scripts/rics-era-overrides.json`, which is
  hand kept here from the
  [UIC RICS register](https://www.uic.org/support-activities/it/rics?recherche=rics):
  UIC publishes that as a PDF and grants no reuse licence over it, so what is
  taken is a code and the organisation it stands for, one at a time, and that
  compilation is ours: MIT or ODbL, at your option.
- `src/lib/tickets/uic/era-orgs.json` is the Organisation Code Register
  published by the **European Union Agency for Railways**. ERA's copyright
  notice grants reproduction provided the source is acknowledged, so keep the
  acknowledgement with the table: *source, European Union Agency for Railways*.
  It travels in the file's `_note` along with what was changed. Use is also
  subject to ERA's [Terms of Use](https://teleref.era.europa.eu/termsOfUsage-OCR-v1.0.pdf),
  which ask that the reference data be used for rail-sector purposes and within
  the published technical constraints.

## Data with no licence granted

- `src/lib/tickets/bob/participants.json` is the BoB participant id register,
  read from a page in Samtrafiken's BoB Confluence space that needs a login and
  publishes no reuse terms. What is taken is an id and the organisation that
  holds it, which is a fact about a number and the only thing that makes a BoB
  ticket's issuer legible; the page is not redistributed and nothing else on it
  is kept. The contact person named against each participant is deliberately
  not here, and should not be added: it is personal data a ticket parser has no
  use for. Anyone redistributing ticketish should satisfy themselves about this
  file the same way they would about `vdv/orgs.json` below.
- `src/lib/tickets/data/db-leitpunkte.json` holds the DB Leitpunktkürzel, the
  route point abbreviations a Via text is written in. They come from part 6 of
  the Entfernungswerk, which DB publishes as a tariff document with the
  Deutschlandtarif price list: it is not a licensed open data set and should
  not be described as one. What is taken is an abbreviation and the station it
  stands for, which is a fact about a code rather than a copy of the document;
  the document is not redistributed and its distance tables are untouched. The
  IBNR printed beside each name is deliberately not kept, since this repo uses
  UIC codes and holding both would invite reading one as the other.
- `src/lib/tickets/vdv/orgs.json` is the organisation table compiled by the
  KCD+eTicketinfo Android app, used with attribution. No licence was granted to
  us and none is granted onward. It is not public domain reference data and is
  not cleared for commercial reuse: ticketish is a free tool for rail
  enthusiasts, and anyone repackaging it commercially should strip this file or
  clear it with the app's authors first.

## Third party data, on the terms its source publishes

These belong to their respective owners. Check the source's terms before
redistributing, particularly the first one, which is the only entry here that
comes with a licence agreement of its own.

- `src/lib/tickets/rsp/nlc.json`: UK station names from the RDG / National Rail
  fares feed, which requires a free National Rail Open Data account and carries
  its own licence agreement.
- `src/lib/tickets/vdv/ca-keys.json`: VDV KA CA public keys, from VDV KA's
  public LDAP directory.
- `src/lib/tickets/tcdd/stations.json`: from the station list TCDD's own
  e-ticket site reads.
- `src/lib/tickets/data/uic-countries.json`: UIC country codes, from the UIC
  reference data.
- `tests/fixtures/public/` and `static/samples/`: DB's published Muster
  (specimen) tickets. Nothing from a real ticket is in this repository.

---

Copyright (c) 2026 ave

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The EUPL-1.2 text is at
https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
