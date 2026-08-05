#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/renfe/stations.json from Renfe's published station list.

Renfe barcodes identify the origin and destination by Renfe's own station
code, which is neither the UIC location code nor the domestic Adif one, so
none of the tables under data/ reaches them. Renfe publishes the whole list as
the "Estaciones. Listado completo" dataset, and its CODIGO column is that
space: 71801 is Barcelona-Sants and 60000 is Madrid-Puerta de Atocha, which is
what the barcodes carry.

Provenance
----------
https://data.renfe.com/dataset/estaciones-listado-completo is published by
Renfe Operadora under Creative Commons Attribution 4.0. That is an attribution
licence and nothing more: commercial reuse is allowed and there is no
share-alike, but the credit has to travel with the data and the modifications
have to be stated. Both live inside the JSON as `_note` so they cannot be
separated from it, and are repeated in src/lib/tickets/renfe/stations.ts and
the README credits.

The modification is the obvious one: of the twelve columns Renfe publishes,
only the code and the name are kept. The names are kept exactly as issued, in
upper case, which is also how they are printed on the ticket the barcode came
off: title casing 1000 Spanish, Catalan, Galician and Basque names by rule
would quietly get some of them wrong, and a station name is read by a ticket
inspector.

The dataset offers the same table as CSV and as XLSX. The CSV is what this
reads: it needs nothing but the standard library, and it keeps the leading
zero on a five digit code where the spreadsheet has already lost it.

Usage:
    python scripts/build-renfe-stations.py
"""
import csv
import io
import json
import pathlib
import sys
import urllib.request

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "renfe" / "stations.json"

URL = "https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv"

NOTE = (
    "Station names from the 'Estaciones. Listado completo' dataset published by "
    "Renfe Operadora at https://data.renfe.com/dataset/estaciones-listado-completo, "
    "under Creative Commons Attribution 4.0. Keep the attribution wherever this "
    "table goes: Origen de los datos: Renfe Operadora. Modified from the original: "
    "only the CODIGO and DESCRIPCION columns are kept, and the names are left in "
    "the upper case Renfe issues them in. Rebuilt by "
    "scripts/build-renfe-stations.py; do not edit by hand, put corrections in the "
    "OVERRIDES map in src/lib/tickets/renfe/stations.ts."
)

# The file is Latin-1 and semicolon separated, as Spanish spreadsheets are.
ENCODING = "latin-1"


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "ticketish-build"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode(ENCODING)
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the station list: {exc}", file=sys.stderr)
        return 1

    rows = csv.DictReader(io.StringIO(body), delimiter=";")
    if not rows.fieldnames or "CODIGO" not in rows.fieldnames:
        print(f"unexpected columns: {rows.fieldnames}", file=sys.stderr)
        return 1

    names: dict[str, str] = {}
    for row in rows:
        code = (row.get("CODIGO") or "").strip()
        name = " ".join((row.get("DESCRIPCION") or "").split())
        if not code.isdigit() or not name:
            continue
        # Codes are five digits with the leading zero kept, which is how they
        # are printed and how the barcode pads them.
        names[code.zfill(5)] = name

    # A sanity floor: Renfe has served around a thousand stations for years, so
    # a sudden collapse means the file changed shape rather than Spain closing
    # its railways.
    if len(names) < 800:
        print(f"only {len(names)} stations, refusing to write", file=sys.stderr)
        return 1

    table = {"_note": NOTE, "stations": {k: names[k] for k in sorted(names)}}
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} with {len(names)} stations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
