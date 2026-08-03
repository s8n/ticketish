#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Merge the vendored VDV product name files into one lookup table.

Input:  scripts/vdv-products/productids_*.json  (see the README there)
Output: src/lib/tickets/vdv/products.json, mapping "<orgId>_<productId>"
        to the product name.

Unlike the CA keys and NLC names there is no upstream feed to poll, so this
is a plain offline merge: run it after changing anything under
scripts/vdv-products/.
"""
import json
import pathlib

REPO = pathlib.Path(__file__).parent.parent
SRC = REPO / "scripts" / "vdv-products"
OUT = REPO / "src" / "lib" / "tickets" / "vdv" / "products.json"


def main():
    products: dict[str, str] = {}
    conflicts = []

    # our own file goes last so it can fill gaps without being overwritten
    files = sorted(SRC.glob("productids_*.json"), key=lambda p: p.name == "productids_ticketish.json")

    for path in files:
        data = json.loads(path.read_text())
        for entry in data.get("textmap", []):
            key, text = entry.get("key"), entry.get("text")
            if not key or not text:
                continue
            if "_" not in key:
                continue
            if key in products and products[key] != text:
                conflicts.append((key, products[key], text, path.name))
            products[key] = text

    for key, old, new, where in conflicts:
        print(f"note: {key} redefined in {where}: {old!r} -> {new!r}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(products, separators=(",", ":"), sort_keys=True, ensure_ascii=False))
    orgs = {k.split("_")[0] for k in products}
    print(f"wrote {len(products)} products across {len(orgs)} organisations "
          f"to {OUT} ({OUT.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
