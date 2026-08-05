#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/data/db-leitpunkte.json from DB's Entfernungswerk.

A DB "Via" text is a route written as Leitpunkte: `HAR*(HH*LWL*WBE/UE*SAW)*BSP`
is a list of points a ticket is valid over, each one an abbreviation of one to
four upper case letters. They are not DS100/Ril 100 codes, which are a
different space belonging to the infrastructure side: Augsburg Hbf is MA in
DS100 and A here. They come from the tariff side, and the list of them is part
six of the Entfernungswerk, the distance tables published with the
Deutschlandtarif's price list.

Provenance
----------
The Entfernungswerk is published by DB as a tariff document, not as a licensed
open data set: there is no reuse licence attached to it, and it should not be
described as one. What is taken out of it here is the pair every Via text needs
to be legible, an abbreviation and the station it stands for, which is a fact
about a code rather than a copy of the document. The document itself is not
redistributed and the tables that make up the rest of it are not touched.

The link changes with each edition, so it is looked up rather than pinned: the
AGB page lists the current Entfernungswerk parts, and part six is the one whose
file name contains "Leitpunktkuerzel". The edition date printed in the PDF's
footer is written into the JSON, since this is an annual document and knowing
which year's names are in the table is most of knowing whether it is stale.

The PDF also gives an IBNR and a Verbund for each point. Neither is kept. The
IBNR in particular is the domestic numbering that this repo deliberately does
not use anywhere: DB puts the UIC code in its barcodes, and having both in the
repo would invite reading one as the other.

Needs poppler-utils for `pdftotext`, which reads the four column layout
correctly where a generic text extractor runs the columns together.

Usage:
    python scripts/build-db-leitpunkte.py
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "data" / "db-leitpunkte.json"

AGB_URL = "https://www.bahn.de/agb"
PDF_LINK = re.compile(
    r'https://assets\.static-bahn\.de/dam/jcr:[0-9a-f-]+/[^"\']*Leitpunktkuerzel[^"\']*\.pdf'
)

# "A   Augsburg Hbf   13   AVV", with the last two columns each optional: 87 of
# the points are in no Verbund, and the columns are separated by a run of
# spaces that never appears inside a name.
ROW = re.compile(
    r"^\s*([A-Z]{1,5})\s{2,}(.+?)(?:\s{2,}(\d+))?(?:\s{2,}([A-Z][A-Z/-]*))?\s*$"
)
FOOTER = re.compile(r"^\s*(\d{2})\.(\d{2})\.(\d{4})\s+-\s*\d+/\d+\s*-\s*$")
HEADER = re.compile(r"^\s*Leitpunktkürzel")

NOTE = (
    "DB Leitpunktkürzel, the route point abbreviations a ticket's Via text is "
    "written in, with the station each one stands for. Read out of part 6 of the "
    "Entfernungswerk (Leitpunktkürzel) published by DB with the Deutschlandtarif "
    "price list, linked from https://www.bahn.de/agb. That is a tariff "
    "publication rather than a licensed open data set, so this is the code and "
    "the name only, which is a fact about an abbreviation. Rebuilt by "
    "scripts/build-db-leitpunkte.py; do not edit by hand."
)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ticketish-build"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main() -> int:
    if not shutil.which("pdftotext"):
        print("pdftotext not found; install poppler-utils", file=sys.stderr)
        return 1

    try:
        page = fetch(AGB_URL).decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch {AGB_URL}: {exc}", file=sys.stderr)
        return 1

    link = PDF_LINK.search(page)
    if not link:
        print("no Leitpunktkuerzel PDF linked from the AGB page", file=sys.stderr)
        return 1

    try:
        pdf = fetch(link.group(0))
    except Exception as exc:  # noqa: BLE001
        print(f"could not fetch {link.group(0)}: {exc}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        path = pathlib.Path(tmp) / "leitpunkte.pdf"
        path.write_bytes(pdf)
        # -layout keeps the columns apart, which is the whole reason this reads
        # a PDF at all rather than giving up on it
        text = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            capture_output=True,
            text=True,
            check=False,
        )
    if text.returncode != 0:
        print(f"pdftotext failed: {text.stderr.strip()}", file=sys.stderr)
        return 1

    points: dict[str, str] = {}
    edition: str | None = None
    unparsed: list[str] = []
    for line in text.stdout.splitlines():
        if not line.strip() or HEADER.match(line):
            continue
        foot = FOOTER.match(line)
        if foot:
            edition = f"{foot.group(3)}-{foot.group(2)}-{foot.group(1)}"
            continue
        row = ROW.match(line)
        if not row:
            unparsed.append(line.strip())
            continue
        name = " ".join(row.group(2).split())
        if name:
            points[row.group(1)] = name

    # A line that is neither a point nor page furniture means the layout moved,
    # and a table half read is worse than yesterday's table.
    if unparsed:
        print(f"{len(unparsed)} lines did not parse, refusing to write:", file=sys.stderr)
        for line in unparsed[:10]:
            print(f"  {line}", file=sys.stderr)
        return 1

    if len(points) < 500:
        print(f"only {len(points)} Leitpunkte, refusing to write", file=sys.stderr)
        return 1

    table = {
        "_note": NOTE,
        "_edition": edition or "unknown",
        "points": {k: points[k] for k in sorted(points)},
    }
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} with {len(points)} points, edition {edition}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
