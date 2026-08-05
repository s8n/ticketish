#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Fill the gaps in the UIC station table from the UIC Primary Location Code register.

Provenance, please read before touching this data
-------------------------------------------------
`uic-stations.json` comes from trainline-eu/stations, which is a distributor's
catalogue: it knows the stations Trainline sells to, and its coverage follows
that. Germany and France are near complete; Poland has 141 stations of 4,670,
Romania 10 of 2,335, Croatia 14 of 566. A HŽPP or MÁV ticket therefore shows
numbers where names belong, and no amount of refreshing that table fixes it,
because the missing rows are stations nobody sells through Trainline.

The register those codes actually come from is the UIC Primary Location Code
list, kept in the Central Reference File Database that RailNetEurope hosts for
UIC. It is not published for download: UIC's own ENEE database closed in 2019
and the CRD replaced it behind an account, and no reuse licence for the data
has been identified. So this is the table in this repo whose terms are least
settled, less settled than the VDV one, which at least has a licence to point
at. It is here because a station name on a ticket is a fact a passenger is
holding in their hand, and it is kept as small as the job allows: names only,
no coordinates, flags, validity dates or infrastructure manager, and only for
the countries where the catalogue is thin. If the terms turn out to forbid it,
this is one file and one loader to remove.

The export is not redistributable through this repo and is not in it. Drop a
CRD export named `primary_location_YYYY_MM_DD.xml` in `standards/`
(gitignored) and run this script; without it the committed JSON stays as it is.

What "thin" means
-----------------
Decided per country by the script rather than by a hand-written list, so that a
newer export re-answers the question instead of preserving today's one:

* Where the register's Passenger_Possible_Flag is maintained, a country is thin
  when the catalogue has under half of its passenger locations, and only those
  passenger locations are taken. This is most of Europe.
* Where the flag is unset on nearly everything, it cannot be a filter: France
  marks 1 location of 8,841, Austria 37 of 2,558, Croatia none of 566. There a
  country is thin only when the catalogue has under a quarter of *all* its
  active locations, and then everything active is taken. The higher bar is
  because taking everything means taking the freight sidings too.

Britain falls out of this on the second rule, at 37%, which is the right answer
for a different reason: British tickets here are RSP6 and carry NLC codes, and
the 4,491 the register would add are the freight tail of a passenger network
the catalogue already covers.

Only codes absent from `uic-stations.json` are written, so the two tables never
disagree about a station and never have to be reconciled: this one is consulted
where the other one is silent.

Usage:
    python scripts/build-plc-stations.py
"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

REPO = pathlib.Path(__file__).parent.parent
DATA = REPO / "src" / "lib" / "tickets" / "data"
OUT = DATA / "plc-stations.json"
EXPORTS = REPO / "standards"

NS = "{http://ws.refdata.crd.cc.uic.org/replication/schemas}"
EXPORT_NAME = re.compile(r"primary_location_(\d{4})_(\d{2})_(\d{2})\.xml$")

# Share of a country's locations that must carry the passenger flag before the
# flag is believed at all, and the coverage below which a country counts as
# thin, with and without it.
FLAG_ALIVE = 0.10
THIN_PASSENGER = 0.50
THIN_ALL = 0.25

NOTE = (
    "Station names from the UIC Primary Location Code register, held in the "
    "Central Reference File Database that RailNetEurope hosts for UIC. This "
    "fills the countries where the trainline-eu catalogue in uic-stations.json "
    "is thin, and is only consulted for codes that table does not have. No "
    "reuse licence has been identified for the register, which makes this the "
    "least settled table in this repo: it holds names and codes and nothing "
    "else, and it is one file and one loader to remove if the terms turn out to "
    "forbid it. Rebuilt by scripts/build-plc-stations.py from a CRD export; do "
    "not edit by hand, put corrections in the OVERRIDES map in "
    "src/lib/tickets/stations.ts."
)


def newest_export() -> pathlib.Path | None:
    found = sorted(p for p in EXPORTS.glob("primary_location_*.xml") if EXPORT_NAME.search(p.name))
    return found[-1] if found else None


def main() -> int:
    export = newest_export()
    if not export:
        print(
            f"no CRD export in {EXPORTS.relative_to(REPO)}/; leaving "
            f"{OUT.relative_to(REPO)} as it is",
            file=sys.stderr,
        )
        return 1

    match = EXPORT_NAME.search(export.name)
    exported = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    countries = json.loads((DATA / "uic-countries.json").read_text(encoding="utf-8"))
    iso_to_uic = {v["iso"]: k for k, v in countries.items()}
    have = json.loads((DATA / "uic-stations.json").read_text(encoding="utf-8"))["stations"]

    # code, name, passenger flag, grouped by country
    by_country: dict[str, list[tuple[str, str, bool]]] = {}
    for _, el in ET.iterparse(export, events=("end",)):
        if el.tag != NS + "Primary_Location":
            continue
        get = lambda tag: (el.findtext(NS + tag) or "").strip()  # noqa: E731
        iso, location, name = get("Country_Iso_Code"), get("Location_Code"), get("Location_Name")
        active = get("Active_Flag") == "true"
        passenger = get("Passenger_Possible_Flag") == "true"
        el.clear()
        if not (active and name and location.isdigit() and len(location) <= 5):
            continue
        uic = iso_to_uic.get(iso)
        if not uic:
            continue
        by_country.setdefault(iso, []).append((uic + location.zfill(5), name, passenger))

    if not by_country:
        print(f"{export.name} held no locations; is it a CRD export?", file=sys.stderr)
        return 1

    stations: dict[str, str] = {}
    taken: list[str] = []
    for iso, rows in sorted(by_country.items()):
        prefix = iso_to_uic[iso]
        ours = sum(1 for code in have if code.startswith(prefix))
        passenger = [(c, n) for c, n, p in rows if p]
        if len(passenger) / len(rows) > FLAG_ALIVE:
            thin, keep = ours < THIN_PASSENGER * len(passenger), passenger
        else:
            thin, keep = ours < THIN_ALL * len(rows), [(c, n) for c, n, _ in rows]
        if not thin:
            continue
        added = {c: n for c, n in keep if c not in have}
        stations.update(added)
        taken.append(f"{iso} +{len(added)}")

    if len(stations) < 5000:
        print(f"only {len(stations)} gap entries, refusing to write", file=sys.stderr)
        return 1

    table = {
        "_note": NOTE,
        "_export": exported,
        "stations": {k: stations[k] for k in sorted(stations, key=int)},
    }
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} with {len(stations)} names from the {exported} export")
    print(f"  {', '.join(taken)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
