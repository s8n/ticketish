#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/data/airlines.json from the OpenFlights airline list.

A boarding pass names its airlines by IATA designator: the carrier flying the
leg, the one that sold it, and the one whose frequent flyer programme the
number belongs to. All three are two characters and none of them is a name.

The source is npow/airline-codes, which normalises jpatokal/openflights and
publishes the result as JSON. **The data is OpenFlights', under the Open
Database License, and the ISC licence in that package covers its code and not
the table.** So the attribution and the share-alike travel with what is built
here; see the `_note` written into the output and docs/credits.md.

The trap in this table is that IATA designators get reused. About a third of
them have belonged to more than one airline, so the table cannot simply be
keyed by code and filled in. Only codes with exactly one airline OpenFlights
marks as active are written:

- where the airline holding the code has folded, a current pass cannot be
  theirs and naming them would be worse than showing the code;
- where two active airlines share one, the answer is genuinely ambiguous. It
  is always a carrier and its cargo arm, which no passenger pass belongs to,
  but the script says which ones rather than picking, and the OVERRIDES map
  beside the loader names them with a source.

The accounting code a pass carries in item 142 is a different, three digit
numbering that OpenFlights does not record, so that field stays as issued.

Usage:
    python scripts/build-airlines.py
"""
import collections
import json
import pathlib
import re
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "data" / "airlines.json"

URL = "https://raw.githubusercontent.com/npow/airline-codes/master/airlines.json"

NOTE = (
    "IATA airline designators and names from https://github.com/npow/airline-codes, "
    "which republishes the OpenFlights airline database (https://openflights.org/data.php). "
    "That database is made available under the Open Data Commons Open Database "
    "License (ODbL) 1.0, with its contents under the Database Contents License. "
    "This table is a derived database: keep the attribution and keep it under ODbL. "
    "Only codes held by exactly one airline OpenFlights marks active are here, "
    "since designators get reused. Rebuilt by scripts/build-airlines.py; do not "
    "edit by hand, put corrections in the OVERRIDES map in "
    "src/lib/tickets/bcbp/codes.ts."
)

# OpenFlights writes an absent field as a literal backslash-N.
BLANK = {"", "\\N", "-", "N/A"}

# What an IATA designator looks like: two characters, letters and digits. The
# source also carries placeholders such as ".." and "^^" for airlines with no
# designator at all, and a handful of Cyrillic Russian domestic ones. Neither
# can appear in a boarding pass, whose record is printable ASCII throughout.
DESIGNATOR = re.compile(r"[A-Z0-9]{2}")

ESCAPED_QUOTE = re.compile(r"\\+'")

# A sanity floor. Something near a thousand designators have exactly one live
# holder, and have for years.
FLOOR = 700


def clean(name: str) -> str:
    """Undo the escaping that survived the source's own CSV import.

    A few names carry a run of backslashes in front of the apostrophe they
    contain, which is a quoting artifact rather than part of anybody's name.
    """
    return ESCAPED_QUOTE.sub("'", name).strip()


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            rows = json.load(resp)
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the airline list: {exc}", file=sys.stderr)
        return 1

    if not isinstance(rows, list):
        print("unexpected payload: expected a list of airlines", file=sys.stderr)
        return 1

    holders: dict[str, list[str]] = collections.defaultdict(list)
    for row in rows:
        code = (row.get("iata") or "").strip().upper()
        name = clean(row.get("name") or "")
        if not DESIGNATOR.fullmatch(code) or code in BLANK or name in BLANK or not name:
            continue
        if (row.get("active") or "").strip().upper() == "Y":
            holders[code].append(name)

    airlines = {code: names[0] for code, names in holders.items() if len(names) == 1}
    contested = {code: names for code, names in holders.items() if len(names) > 1}

    if len(airlines) < FLOOR:
        print(f"only {len(airlines)} airlines, refusing to write", file=sys.stderr)
        return 1

    ordered = {code: airlines[code] for code in sorted(airlines)}
    OUT.write_text(
        json.dumps({"_note": NOTE, "airlines": ordered}, ensure_ascii=False, indent=0) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(REPO)} with {len(ordered)} airlines")
    for code, names in sorted(contested.items()):
        print(f"  {code} left out: active for {', '.join(sorted(names))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
