#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/data/airports.json from the OurAirports catalogue.

An IATA boarding pass names its origin and destination by three letter code
and nothing else, so a table is the only way to show where the flight goes.

The source is datasets/airport-codes, which tidies the nightly OurAirports
export and republishes it under the Open Data Commons Public Domain Dedication
and Licence (PDDL) 1.0. That is a dedication rather than a share-alike licence,
so nothing has to travel with the table; OurAirports is credited anyway,
because a table nobody can trace is a table nobody can check.

Only the rows that carry an IATA code are kept, which is about a tenth of the
catalogue: the rest are airfields with an ICAO or local code alone and can
never appear in a boarding pass. Metropolitan area codes such as LON and NYC
are not airports and are not in the catalogue either, so a pass issued against
one shows its code.

Names are as OurAirports writes them, less a trailing "Airport". Every second
one ends in it, and a route line reading "LONDON HEATHROW AIRPORT" spends its
width on the word the reader already knows.

Usage:
    python scripts/build-airports.py
"""
import csv
import io
import json
import pathlib
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "data" / "airports.json"

URL = "https://raw.githubusercontent.com/datasets/airport-codes/main/data/airport-codes.csv"

NOTE = (
    "IATA airport codes and names from https://github.com/datasets/airport-codes, "
    "which republishes the OurAirports catalogue (https://ourairports.com/data/) "
    "under the Open Data Commons Public Domain Dedication and Licence (PDDL) 1.0. "
    "Public domain, so no licence travels with this table, but keep the credit. "
    "Rebuilt by scripts/build-airports.py; do not edit by hand, put corrections "
    "in the OVERRIDES map in src/lib/tickets/bcbp/codes.ts."
)

# A sanity floor. The catalogue has carried somewhere over eight thousand IATA
# coded airports for years, so a sudden collapse means the export changed
# shape rather than the world losing its airports.
FLOOR = 7000


def tidy(name: str) -> str:
    """OurAirports' name, less the trailing word that is true of all of them."""
    trimmed = name.removesuffix(" Airport").strip()
    # "Airport" alone is the whole name for a handful of entries, and trimming
    # it would leave nothing to show.
    return trimmed or name


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read().decode("utf-8")
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the airport catalogue: {exc}", file=sys.stderr)
        return 1

    airports: dict[str, list[str]] = {}
    clashes = 0
    for row in csv.DictReader(io.StringIO(body)):
        code = (row.get("iata_code") or "").strip().upper()
        name = (row.get("name") or "").strip()
        if len(code) != 3 or not code.isalpha() or not name:
            continue
        if code in airports:
            # Two airports claiming one code means the catalogue disagrees with
            # itself, and neither answer can be trusted over the other.
            clashes += 1
            airports.pop(code, None)
            continue
        airports[code] = [tidy(name), (row.get("municipality") or "").strip(),
                          (row.get("iso_country") or "").strip().upper()]

    if len(airports) < FLOOR:
        print(f"only {len(airports)} airports, refusing to write", file=sys.stderr)
        return 1

    # Trailing blanks cost bytes in a table this size and say nothing.
    for entry in airports.values():
        while len(entry) > 1 and not entry[-1]:
            entry.pop()

    ordered = {code: airports[code] for code in sorted(airports)}
    OUT.write_text(
        json.dumps({"_note": NOTE, "airports": ordered}, ensure_ascii=False, indent=0) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(REPO)} with {len(ordered)} airports")
    if clashes:
        print(f"dropped {clashes} codes the catalogue gives to more than one airport")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
