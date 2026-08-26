#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/data/airlines.json from OpenTravelData.

A boarding pass names its airlines by IATA designator: the carrier flying the
leg, the one that sold it, and the one whose frequent flyer programme the
number belongs to. All three are two characters and none of them is a name.

The catch is that a designator outlives the airline that held it. IATA
reassigns them, so AZ is Alitalia on a pass from 2019 and ITA Airways on one
from 2023, and a table that answers with one name per code is wrong for
whichever of those it does not pick.

OpenTravelData records the validity of each holding, so this table keeps every
holder a code has had with the dates it had it, and the lookup in
`bcbp/codes.ts` answers against the flight date the pass already carries. An
absent date means an open end rather than an unknown one: an airline with no
`validity_to` still holds its code, and one with no `validity_from` has held
it for as long as the source knows.

OPTD publishes what it curates under CC-BY 4.0, so this table needs the
attribution that its `_note` carries and nothing more. Note that the `data`
directory of that repository is a different matter, holding snapshots from
other producers on their own terms; `opentraveldata/optd_airlines.csv` is
OPTD's own and is the only file read here.

Also kept is `num_code`, the three digit accounting code, which is the
numbering a pass carries in item 142 and which nothing else here could
resolve. And `type`, which is how the one case that dates cannot settle gets
settled: Lufthansa and Lufthansa Cargo both hold LH today, and only one of
them flies passengers.

Usage:
    python scripts/build-airlines.py
"""
import collections
import csv
import io
import json
import pathlib
import re
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "data" / "airlines.json"

URL = (
    "https://raw.githubusercontent.com/opentraveldata/opentraveldata/master/"
    "opentraveldata/optd_airlines.csv"
)

NOTE = (
    "IATA airline designators, their validity, accounting codes and names from "
    "https://github.com/opentraveldata/opentraveldata (opentraveldata/optd_airlines.csv), "
    "which OpenTravelData curates and publishes under the Creative Commons "
    "Attribution 4.0 licence (https://creativecommons.org/licenses/by/4.0/). "
    "Keep the attribution; nothing else travels with it. Each entry is "
    "[name, valid from, valid until, accounting code, type], trailing empties "
    "dropped, and a blank date means an open end. Rebuilt by "
    "scripts/build-airlines.py; do not edit by hand, put corrections in the "
    "OVERRIDES map in src/lib/tickets/bcbp/codes.ts."
)

# What an IATA designator looks like: two characters, letters and digits.
DESIGNATOR = re.compile(r"[A-Z0-9]{2}")

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

# A sanity floor. Something over a thousand designators have a holder on
# record, and have for years.
FLOOR = 900


def date(value: str) -> str:
    """A validity date, or blank for the open ends the source leaves empty."""
    value = (value or "").strip()
    return value if ISO_DATE.fullmatch(value) else ""


def overlaps(a: list, b: list) -> bool:
    """Whether two holdings of one code are ever current at the same moment."""
    a_from, a_to = a[1] or "0000-00-00", a[2] or "9999-99-99"
    b_from, b_to = b[1] or "0000-00-00", b[2] or "9999-99-99"
    return a_from < b_to and b_from < a_to


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read().decode("utf-8")
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the airline list: {exc}", file=sys.stderr)
        return 1

    holders: dict[str, list[list]] = collections.defaultdict(list)
    for row in csv.DictReader(io.StringIO(body), delimiter="^"):
        code = (row.get("2char_code") or "").strip().upper()
        name = (row.get("name") or "").strip()
        if not DESIGNATOR.fullmatch(code) or not name:
            continue
        # 0 is how the source writes an accounting code it does not know.
        num = (row.get("num_code") or "").strip()
        holders[code].append(
            [
                name,
                date(row.get("validity_from", "")),
                date(row.get("validity_to", "")),
                int(num) if num.isdigit() and num != "0" else 0,
                (row.get("type") or "").strip().upper(),
            ]
        )

    if len(holders) < FLOOR:
        print(f"only {len(holders)} designators, refusing to write", file=sys.stderr)
        return 1

    # Oldest holding first, so the lookup reads a code's history in order and
    # picks deterministically where the source leaves two of them overlapping.
    for entries in holders.values():
        entries.sort(key=lambda e: (e[1] or "0000-00-00", e[0]))

    # Say which codes the dates do not settle. Two kinds, and only one of them
    # is worth a line each: a code with several holders that are all still
    # current is answering a question about today wrongly, while ranges that
    # overlapped in the past mostly mean a defunct airline the source never
    # closed off, which the flight date sorts out for any pass that predates
    # its successor. The second is a count, or the log is a wall of names.
    unsettled, historical = [], 0
    for code, entries in sorted(holders.items()):
        live = [e for e in entries if not e[2]]
        if len(live) > 1 and not any("P" in e[4] for e in live):
            unsettled.append((code, [e[0] for e in live]))
        elif any(
            overlaps(e, o) for i, e in enumerate(entries) for o in entries[i + 1 :]
        ):
            historical += 1

    for entry in holders.values():
        for row in entry:
            while len(row) > 1 and not row[-1]:
                row.pop()

    ordered = {code: holders[code] for code in sorted(holders)}
    OUT.write_text(
        json.dumps({"_note": NOTE, "airlines": ordered}, ensure_ascii=False, indent=0) + "\n",
        encoding="utf-8",
    )
    rows = sum(len(v) for v in ordered.values())
    print(f"wrote {OUT.relative_to(REPO)} with {len(ordered)} designators over {rows} holdings")
    for code, names in unsettled:
        print(f"  {code} has several current holders and no passenger type: {', '.join(names)}")
    if historical:
        print(f"  {historical} more codes have holdings that overlapped in the past")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
