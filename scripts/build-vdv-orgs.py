#!/usr/bin/env python3
"""Rebuild the VDV organisation name table from the eTicketInfo Android app.

Provenance, please read before touching this data
-------------------------------------------------
There is no public register of VDV organisation IDs. The complete list sits
behind an authenticated third-party API, which is why this repo only ever had
a dozen entries, each derived from something citable.

The KCD+eTicketinfo app bundles one: `assets/textReplacements/orgid.json`,
about two thousand organisation IDs with company names. That file is the app's
own compilation, not ours and not public-domain reference data. It is used here
with attribution, and the app's licence applies to the result: this is a free
tool for rail enthusiasts, and nothing here is cleared for commercial reuse.
Anyone repackaging ticketish commercially needs to strip orgs.json or clear it
with the app's authors first. The same note is repeated inside orgs.json and in
the header of src/lib/tickets/vdv/orgs.ts so it cannot be missed.

The APK itself is not redistributable and is not in this repo. Drop it in
`software/` (gitignored) and run this script; without it the committed
orgs.json simply stays as it is.

Usage:
    python scripts/build-vdv-orgs.py
"""
import glob
import json
import pathlib
import zipfile

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "vdv" / "orgs.json"
ASSET = "assets/textReplacements/orgid.json"

NOTE = (
    "Organisation names compiled by the KCD+eTicketinfo Android app "
    "(assets/textReplacements/orgid.json), used here with attribution. That "
    "app's licence applies to this table; it is not public-domain reference "
    "data and is not cleared for commercial reuse. Regenerate with "
    "scripts/build-vdv-orgs.py. Corrections belong in the OVERRIDES map in "
    "orgs.ts, not here, so a rebuild stays a clean copy."
)


def main() -> int:
    apks = sorted(glob.glob(str(REPO / "software" / "*.apk")))
    if not apks:
        print("No APK in software/, leaving orgs.json alone. See the docstring.")
        return 1

    for path in apks:
        with zipfile.ZipFile(path) as z:
            if ASSET not in z.namelist():
                continue
            raw = json.loads(z.read(ASSET).decode("utf-8"))
        break
    else:
        print(f"None of {len(apks)} APK(s) contain {ASSET}")
        return 1

    orgs: dict[str, str] = {}
    for entry in raw["textmap"]:
        key, text = entry["key"], entry["text"].strip()
        # the app's table repeats a handful of ids; first one wins
        if key.isdigit() and text and key not in orgs:
            orgs[key] = text

    ordered = {k: orgs[k] for k in sorted(orgs, key=int)}
    OUT.write_text(
        json.dumps({"_note": NOTE, "orgs": ordered}, ensure_ascii=False, indent="\t")
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(ordered)} organisations to {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
