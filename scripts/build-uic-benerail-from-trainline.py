#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build the UIC station and Benerail mnemonic name tables from trainline-eu/stations.

Provenance
----------
https://github.com/trainline-eu/stations is a single CSV of European stations
with the identifiers each distributor uses for them. It is published under the
Open Data Commons Open Database License (ODbL) 1.0, so the tables extracted
here are a derived database: they carry attribution, and anyone redistributing
them has to keep them under ODbL. The note travels inside both JSON files as
`_note` so it cannot be separated from the data, and is repeated in
src/lib/tickets/stations.ts and the README credits.

Two tables come out of it, because tickets identify stations two ways:

* `uic` -> the seven digit UIC location code, which is what FCB records mean by
  stationCodeTable = stationUIC, and what DB's 0080BL S035/S036 blocks encode.
  For Germany this is *not* the domestic IBNR: Koeln Hbf is UIC 8015458 but
  IBNR 8000207, and it is the UIC number that DB puts in the barcode. The IBNR
  lives in the CSV's `db_id` column and is deliberately not used here.
* `benerail_id` -> the five character mnemonic that SNCF e-billets and ELB
  barcodes carry (FRPST, FRAEG). Despite the FR prefix on most entries it
  covers the foreign stations sold to as well, and the German ones are a large
  part of ELB's traffic.

  Not `sncf_id`, which is the neighbouring column and was what this built
  before. The two mostly agree, which is what made the mistake survive: FRPST,
  FRPLY and DEKOH are the same string in both. But 237 mnemonics name a
  *different station* in the two spaces, 207 of them German, so a table built
  from the wrong column called DEFLS Freilassing where the barcode meant
  Salzburg, and DEAND Kulmbach where it meant Andernach. `benerail_id` also
  covers 11k stations against `sncf_id`'s 8k.

  Codes that appear only as an `sncf_id` are deliberately not merged in as a
  fallback. A code that is not a Benerail id is not made into one by there
  being nothing better: showing the mnemonic unresolved says this app does not
  know, which is true, where a name from the neighbouring space says something
  false in the same place a correct answer would go.

Rows without the identifier in question are skipped, which drops the coach and
bus stops that make up most of the file.

Usage:
    python scripts/build-uic-benerail-from-trainline.py
"""
import csv
import io
import json
import pathlib
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
DATA = REPO / "src" / "lib" / "tickets" / "data"

URL = "https://raw.githubusercontent.com/trainline-eu/stations/master/stations.csv"

NOTE = (
    "Derived from https://github.com/trainline-eu/stations, which is published "
    "under the Open Data Commons Open Database License (ODbL) 1.0. This table "
    "is a derived database: keep the attribution and keep it under ODbL. "
    "Rebuilt by scripts/build-uic-benerail-from-trainline.py; do not edit by hand, put "
    "corrections in the OVERRIDES map in src/lib/tickets/stations.ts."
)

# Sanity floors. The source has held around 23k UIC codes and 11k mnemonics for
# a long time, so a collapse means the CSV changed shape rather than half of
# Europe closing its stations.
MIN_UIC = 20000
MIN_BENERAIL = 9000


def fetch() -> str:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read().decode("utf-8")


def write(path: pathlib.Path, stations: dict[str, str], key) -> None:
    ordered = {k: stations[k] for k in sorted(stations, key=key)}
    payload = {"_note": NOTE, "stations": ordered}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"{path.relative_to(REPO)}: {len(ordered)} entries")


def main() -> int:
    try:
        text = fetch()
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the station list: {exc}", file=sys.stderr)
        return 1

    uic: dict[str, str] = {}
    benerail: dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(text), delimiter=";"):
        name = (row.get("name") or "").strip()
        if not name:
            continue
        code = (row.get("uic") or "").strip()
        # Seven digits, country prefix included. Anything else is a stray value
        # rather than a UIC location code.
        if len(code) == 7 and code.isdigit():
            uic[code] = name
        mnemonic = (row.get("benerail_id") or "").strip().upper()
        if len(mnemonic) == 5 and mnemonic.isalpha():
            benerail[mnemonic] = name

    if len(uic) < MIN_UIC or len(benerail) < MIN_BENERAIL:
        print(
            f"only {len(uic)} UIC codes and {len(benerail)} mnemonics, refusing to write",
            file=sys.stderr,
        )
        return 1

    write(DATA / "uic-stations.json", uic, int)
    write(DATA / "benerail-stations.json", benerail, str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
