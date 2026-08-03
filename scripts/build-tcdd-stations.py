#!/usr/bin/env python3
"""Build src/lib/tickets/tcdd/stations.json from TCDD's published station list.

The newer TCDD barcode layout identifies the origin and destination by the
numeric station id of TCDD Tasimacilik's current booking backend. The same
ids are served, unauthenticated, from the CDN that the e-ticket site itself
reads, so the table can simply be rebuilt from there.

Names are kept exactly as TCDD publishes them, in upper case: lower casing
Turkish correctly needs the dotted/dotless i rules, and getting that subtly
wrong on station names would be worse than leaving them as issued.

Older tickets use a different, 9 digit id space belonging to the retired
api-yebsp backend. That service no longer responds, so those ids cannot be
refreshed and are not covered here.

Usage:
    python scripts/build-tcdd-stations.py
"""
import json
import pathlib
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "tcdd" / "stations.json"

URL = "https://cdn-api-prod-ytp.tcddtasimacilik.gov.tr/datas/stations.json"


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            stations = json.load(resp)
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the station list: {exc}", file=sys.stderr)
        return 1

    if not isinstance(stations, list):
        print("unexpected payload: expected a list of stations", file=sys.stderr)
        return 1

    names: dict[str, str] = {}
    for station in stations:
        sid = station.get("id")
        name = (station.get("name") or "").strip()
        if sid is None or not name:
            continue
        names[str(sid)] = name

    # A sanity floor: the list has held several hundred stations for years, so
    # a sudden collapse means the feed changed shape rather than TCDD closing
    # the network.
    if len(names) < 300:
        print(f"only {len(names)} stations, refusing to write", file=sys.stderr)
        return 1

    ordered = {k: names[k] for k in sorted(names, key=int)}
    OUT.write_text(json.dumps(ordered, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} with {len(ordered)} stations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
