#!/usr/bin/env python3
"""Build src/lib/tickets/rsp/nlc.json from the RDG/National Rail fares feed.

UK RSP6 tickets identify stations by NLC code only. The fares feed's .LOC
file maps those codes to names (record type RL for locations, RG for groups
such as "London Zones 1-2"). Only records valid on the build date are kept.

The feed needs a free National Rail Open Data account; credentials come from
the NR_USERNAME and NR_PASSWORD environment variables (repo secrets in CI).

Usage:
    NR_USERNAME=... NR_PASSWORD=... python scripts/build-nlc-names.py
"""
import datetime
import io
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request
import zipfile

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "rsp" / "nlc.json"

AUTH_URL = "https://opendata.nationalrail.co.uk/authenticate"
FARES_URL = "https://opendata.nationalrail.co.uk/api/staticfeeds/2.0/fares"

# Words that should stay upper case when title casing station names.
KEEP_UPPER = {
    "DLR", "HS1", "IOW", "TFL", "UK", "NLC", "CIV", "RTC", "PTE", "BR",
    "NE", "NW", "SE", "SW", "N", "S", "E", "W",
}


def title_case(name: str) -> str:
    words = []
    for word in name.split():
        if word in KEEP_UPPER or not word.isalpha():
            words.append(word)
        else:
            words.append(word.capitalize())
    return " ".join(words)


def fetch_fares() -> bytes:
    username = os.environ.get("NR_USERNAME")
    password = os.environ.get("NR_PASSWORD")
    if not username or not password:
        print("NR_USERNAME / NR_PASSWORD are not set; skipping NLC rebuild.")
        sys.exit(0)

    body = urllib.parse.urlencode({"username": username, "password": password}).encode()
    req = urllib.request.Request(AUTH_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        token = json.load(r)["token"]

    req = urllib.request.Request(FARES_URL, headers={"X-Auth-Token": token})
    with urllib.request.urlopen(req, timeout=900) as r:
        return r.read()


def parse_loc(data: bytes, today: datetime.date) -> dict:
    """Extract current NLC -> {name, crs} from the .LOC member of the feed."""
    zf = zipfile.ZipFile(io.BytesIO(data))
    loc_name = next(n for n in zf.namelist() if n.upper().endswith(".LOC"))

    out = {}
    with zf.open(loc_name) as f:
        for raw in f:
            line = raw.decode("latin-1")
            kind = line[0:2]
            if kind not in ("RL", "RG"):
                continue
            try:
                end = datetime.datetime.strptime(line[9:17], "%d%m%Y").date()
                start = datetime.datetime.strptime(line[17:25], "%d%m%Y").date()
            except ValueError:
                continue
            if start > today or end < today:
                continue

            if kind == "RL":
                nlc = line[36:40]
                name = line[40:56].strip()
                crs = line[56:59].strip()
            else:
                # group records carry no separate NLC field; derive it from
                # the UIC code (70 + NLC + check digit)
                nlc = line[4:8]
                name = line[33:49].strip()
                crs = ""

            if not nlc.strip() or not name:
                continue
            entry = {"n": title_case(name)}
            if crs:
                entry["c"] = crs
            out[nlc] = entry
    return out


def main():
    today = datetime.date.today()
    entries = parse_loc(fetch_fares(), today)
    if len(entries) < 1000:
        raise SystemExit(f"only {len(entries)} NLC entries parsed, refusing to write")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, separators=(",", ":"), sort_keys=True))
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {len(entries)} NLC entries to {OUT} ({size_kb:.0f} KiB)")


if __name__ == "__main__":
    main()
