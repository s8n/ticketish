#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/swisspass/orgs.json from the Swiss business organisations.

A SwissPass / NOVA ticket names the organisation that sold it, and the zones it
is valid in, by Geschäftsorganisation number. Those numbers are the ones the
Swiss public transport sector keeps in atlas, published as open data by the
Geschäftsstelle Systemaufgaben Kundeninformation (SKI) on behalf of the BAV.

Of the twenty-three columns, four are kept: the number, the German name and
abbreviation, and the end of validity. The rest is the SBOID and SAID that
identify an organisation in other systems, the same name in three more
languages, the business types, and edit timestamps, none of which a ticket
needs.

German rather than English because a ticket bought in Switzerland is read in
one of the national languages, and where the two columns disagree the English
one translates operator names that nobody translates on a ticket. It is also
the less carefully kept of the two. The abbreviation is the same in every
language, so it is taken from the German column only for company.

An organisation appears once per validity window, so one that has been renamed
is in there under each name it has had, each with the dates it went by it. The
row with the latest end of validity wins, which is the current name where there
is one and the last one used where the organisation is gone.

Nothing is dropped for being expired. A ticket outlives the organisation that
sold it, and `validTo` travels into the JSON as `until` so the app can say the
number has lapsed rather than pretend it has not. Open-ended rows are dated
9999-12-31 and carry no `until` at all.

Provenance
----------
https://opentransportdata.swiss publishes this as Open Data. Its terms
(https://opentransportdata.swiss/de/terms-of-use/) ask three things: name
opentransportdata.swiss as the source of the raw data, which travels inside the
JSON as `_note`; publish anything derived under your own name; and keep the
data up to date with its source, which is what the monthly workflow is for. A
snapshot that is never refreshed does not satisfy the third.

The download URL carries a resource UUID that a republished file could change,
so this reads the dataset's DCAT description instead, which is addressed by the
dataset name, and takes the current URL from there. If SKI moves to a v3 the
name below is the thing to bump, and this fails loudly rather than quietly
reading an old file.

Usage:
    python scripts/build-nova-orgs.py
"""
import csv
import io
import json
import pathlib
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "swisspass" / "orgs.json"

DATASET = "business-organisation-v2"
META = f"https://data.opentransportdata.swiss/dataset/{DATASET}.jsonld"
FILE = "full-business-organisation.csv"

# atlas writes an open-ended validity as the far end of the calendar.
FOREVER = "9999-12-31"

NOTE = (
    "Swiss Geschäftsorganisation numbers to the organisations that hold them, "
    "from the business organisations dataset published by the Geschäftsstelle "
    "Systemaufgaben Kundeninformation (SKI) on behalf of the BAV. Source of the "
    "raw data: opentransportdata.swiss. Its terms of use, "
    "https://opentransportdata.swiss/de/terms-of-use/, ask for that credit and "
    "for the data to be kept up to date with its source, which is what the "
    "monthly workflow does. Modified from the original: of twenty-three columns "
    "only the organisation number, the German name and abbreviation and the end "
    "of validity are kept, and an organisation with several validity windows is "
    "reduced to the row that runs latest. Rebuilt by "
    "scripts/build-nova-orgs.py; do not edit by hand, put corrections in the "
    "OVERRIDES map in src/lib/tickets/swisspass/orgs.ts."
)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ticketish-build"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


def titles(node: dict) -> list[str]:
    """A DCAT title, which is one object per language."""
    title = node.get("dct:title")
    if isinstance(title, list):
        return [t.get("@value") for t in title]
    if isinstance(title, dict):
        return [title.get("@value")]
    return [title] if title else []


def resource_url(meta: bytes, filename: str) -> str:
    graph = json.loads(meta)["@graph"]
    for node in graph:
        if "Distribution" not in str(node.get("@type")):
            continue
        if filename not in titles(node):
            continue
        url = node.get("dcat:downloadURL")
        if isinstance(url, dict):
            return url["@id"]
        if isinstance(url, str):
            return url
    raise SystemExit(f"no distribution named {filename} in {DATASET}")


def clean(text: str) -> str:
    return " ".join(text.split())


def has_letters(text: str) -> bool:
    return any(ch.isalnum() for ch in text)


def main() -> int:
    try:
        url = resource_url(get(META), FILE)
        body = get(url).decode("utf-8-sig")
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the business organisations: {exc}", file=sys.stderr)
        return 1

    rows = csv.DictReader(io.StringIO(body), delimiter=";")
    wanted = ("organisationNumber", "descriptionDe", "abbreviationDe", "validTo")
    missing = [c for c in wanted if c not in (rows.fieldnames or [])]
    if missing:
        print(f"columns missing from the export: {missing}", file=sys.stderr)
        return 1

    latest: dict[str, dict[str, str]] = {}
    for row in rows:
        number = (row.get("organisationNumber") or "").strip()
        name = clean(row.get("descriptionDe") or "")
        valid_to = (row.get("validTo") or "").strip()
        if not number.isdigit() or not name or not valid_to:
            continue
        if number in latest and latest[number]["validTo"] >= valid_to:
            continue
        latest[number] = {"name": name, "validTo": valid_to,
                          "abbreviation": clean(row.get("abbreviationDe") or "")}

    orgs: dict[str, dict[str, str]] = {}
    for number, row in latest.items():
        entry = {"n": row["name"]}
        acronym = row["abbreviation"]
        if acronym and has_letters(acronym) and acronym.casefold() != row["name"].casefold():
            # The Südostbahn sobs. It did so while this table was kept by hand
            # and there is no reason a generated one should be less fun.
            if "südostbahn" in row["name"].casefold():
                acronym += " 😭"
            entry["a"] = acronym
        if row["validTo"] != FOREVER:
            entry["until"] = row["validTo"]
        orgs[number] = entry

    # A sanity floor: the register has held well over a thousand organisations
    # for years, so a collapse means the export changed shape rather than
    # Switzerland running out of transport companies.
    if len(orgs) < 1000:
        print(f"only {len(orgs)} organisations, refusing to write", file=sys.stderr)
        return 1

    table = {"_note": NOTE, "orgs": {k: orgs[k] for k in sorted(orgs, key=int)}}
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    expired = sum(1 for e in orgs.values() if "until" in e)
    print(f"wrote {OUT.relative_to(REPO)} with {len(orgs)} organisations ({expired} expired)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
