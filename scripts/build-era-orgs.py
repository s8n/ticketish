#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/uic/era-orgs.json from ERA's Organisation Code register.

Who issued a ticket is written into a barcode as a company code, and until now
the only table for those here was the hand curated rics.json. From 1 January
2026 UIC only allocates RICS codes to organisations outside the EU: inside it,
the European Union Agency for Railways allocates Organisation Codes from its
own register (OCR), and companies that already held a RICS code kept the same
value as their Organisation Code. So the register is the same numbering space
a ticket carries, and it is published in full.

ERA's export is one spreadsheet with two worksheets, "OrganisationCodes" and
"RevokedCodes", and both are read. From the first, four of its fifteen columns:
the code, the organisation name, its acronym and the country, the last as a two
letter code rather than the name the column holds. The rest is address, city,
email, phone, website and the roles the organisation plays, which no ticket
needs and which the Terms of Use treat as personal data where it names people
(section 4.3). Leaving it in the spreadsheet is the point rather than an
oversight, so do not add those columns.

The revoked sheet is there because a ticket outlives an allocation. NS held
1084 until 2026 and Eurail Group 9902 until 2023, and a barcode issued while
they did still carries the code; naming the organisation that held it beats
showing a bare number. Those entries carry the revocation date in `revoked`
and the app says so where it shows the name, the same way the Swiss table
carries an end of validity. They have no acronym, because the revoked sheet has
no such column, and no country for the same reason. An active allocation always
wins where a code is on both sheets, since a code ERA has given to somebody
else is that organisation's now.

A code is four characters. The digits-only ones are the RICS compatible part
and the only part a UIC barcode can carry; the rest are alphanumeric ERA
allocations (INML, 4XDU) that no format here writes yet. Both are kept, since
the register is what it is and the alphanumeric ones cost a third of the
file.

Some organisations list a "Second code" as well, which is a second allocation
to the same organisation rather than a different one. Those are written into
the table too, so a lookup finds the organisation either way, and a primary
code always wins where the two collide.

Provenance
----------
https://teleref.era.europa.eu/DownloadOrganizationCodes.aspx is the export
behind the Reference Data Portal for Organisation Codes and Location Codes,
published by ERA under Commission Implementing Regulation (EU) 2026/253. Its
Terms of Use (https://teleref.era.europa.eu/termsOfUsage-OCR-v1.0.pdf) do not
grant a licence themselves: section 4.1 defers to the applicable legal notice,
which is ERA's copyright notice at
https://www.era.europa.eu/content/disclaimer-and-copyright-notice and reads
"Reproduction is authorised, provided the source is acknowledged". That is an
attribution obligation and nothing more, and it travels inside the JSON as
`_note` so it cannot be separated from the table.

The other condition worth reading is section 2.2: reference data is to be used
for legitimate rail-sector purposes and within the published technical
constraints. A monthly fetch of a file the portal offers for download is well
inside that. Do not turn this into anything that polls harder.

Usage:
    python scripts/build-era-orgs.py
"""
import datetime
import io
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "uic" / "era-orgs.json"
OUT_RICS = REPO / "src" / "lib" / "tickets" / "uic" / "rics.json"
OVERRIDES = pathlib.Path(__file__).parent / "rics-era-overrides.json"

URL = "https://teleref.era.europa.eu/DownloadOrganizationCodes.aspx"

NOTE = (
    "Organisation Codes from the Organisation Code Register (OCR) published by "
    "the European Union Agency for Railways at "
    "https://teleref.era.europa.eu/. Reproduction is authorised provided the "
    "source is acknowledged, per ERA's copyright notice at "
    "https://www.era.europa.eu/content/disclaimer-and-copyright-notice, so keep "
    "this credit wherever the table goes: source, European Union Agency for "
    "Railways. Modified from the original: of the fifteen columns ERA publishes "
    "only the code, the organisation name, the acronym and the country are kept, "
    "the country as a two letter code, the address, contact and role columns are "
    "dropped, second codes are listed as further keys for the same organisation, "
    "and codes from the revoked sheet are included with their revocation date. "
    "Use is subject to ERA's Terms of "
    "Use, https://teleref.era.europa.eu/termsOfUsage-OCR-v1.0.pdf. Rebuilt by "
    "scripts/build-era-orgs.py; do not edit by hand, put corrections in the "
    "OVERRIDES map in src/lib/tickets/uic/era-orgs.ts."
)

RICS_NOTE = (
    "RICS codes to the organisations that hold them. The register above marks "
    "each row as an Organisation Code or a RICS Code; these are the RICS ones, "
    "which UIC allocates and ERA mirrors, split out so that the two halves of "
    "the numbering answer separately. Same source and same terms as "
    "era-orgs.json: from the European Union Agency for Railways at "
    "https://teleref.era.europa.eu/, reproduction authorised provided the "
    "source is acknowledged, so keep the credit wherever the table goes: "
    "source, European Union Agency for Railways. Rebuilt by "
    "scripts/build-era-orgs.py with scripts/rics-era-overrides.json applied on top; "
    "do not edit by hand, put corrections in that file."
)

# The spreadsheet is OOXML, which is a zip of XML. openpyxl would read it in
# three lines, but every other build script here runs on the standard library
# alone, and what this needs is one sheet of strings.
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RELS_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
DOC_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


# The Country column holds ISO 3166 English short names, articles and all, so
# this maps them to the two letter codes. A name that is not in here leaves the
# field off rather than guessing, and the run prints what it could not place, so
# a country ERA starts writing differently shows up in the workflow log.
COUNTRY_CODES = {
    "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Andorra": "AD",
    "Armenia": "AM", "Austria": "AT", "Azerbaijan": "AZ", "Belarus": "BY",
    "Belgium": "BE", "Bosnia and Herzegovina": "BA", "Bulgaria": "BG",
    "Canada": "CA", "China": "CN", "Congo (the Democratic Republic of the)": "CD",
    "Croatia": "HR", "Czechia": "CZ", "Denmark": "DK", "Egypt": "EG",
    "Estonia": "EE", "Finland": "FI", "France": "FR", "Georgia": "GE",
    "Germany": "DE", "Greece": "GR", "Hungary": "HU", "Iran (Islamic Republic of)": "IR",
    "Iraq": "IQ", "Ireland": "IE", "Israel": "IL", "Italy": "IT", "Japan": "JP",
    "Kazakhstan": "KZ", "Korea (the Democratic People's Republic of)": "KP",
    "Korea (the Republic of)": "KR", "Kyrgyzstan": "KG",
    "Lao People's Democratic Republic (the)": "LA", "Latvia": "LV",
    "Lebanon": "LB", "Lithuania": "LT", "Luxembourg": "LU", "Malaysia": "MY",
    "Malta": "MT", "Mexico": "MX", "Moldova": "MD", "Mongolia": "MN",
    "Montenegro": "ME", "Morocco": "MA", "Netherlands": "NL",
    "North Macedonia": "MK", "Norway": "NO", "Poland": "PL", "Portugal": "PT",
    "Romania": "RO", "Russian Federation (the)": "RU", "Saudi Arabia": "SA",
    "Serbia": "RS", "Slovakia": "SK", "Slovenia": "SI", "South Africa": "ZA",
    "Spain": "ES", "Sweden": "SE", "Switzerland": "CH",
    "Syrian Arab Republic (the)": "SY", "Tajikistan": "TJ", "Tunisia": "TN",
    "Turkmenistan": "TM", "Türkiye": "TR", "Ukraine": "UA",
    "United Arab Emirates (the)": "AE",
    "United Kingdom of Great Britain and Northern Ireland (the)": "GB",
    "United States of America (the)": "US", "Uzbekistan": "UZ", "Viet Nam": "VN",
}

COUNTRY_LOOKUP = {
    (k[: -len(" (the)")] if k.endswith(" (the)") else k).casefold(): v
    for k, v in COUNTRY_CODES.items()
}

# Spreadsheet dates count days from this, which is the serial epoch Excel uses.
EXCEL_EPOCH = datetime.date(1899, 12, 30)

# ERA names the sheet after the day it was exported: "12-08-2026__OrganisationCodes".
SHEET_DATE = re.compile(r"^(\d{2})-(\d{2})-(\d{4})")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ticketish-build"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    """The workbook's string pool, which is where all the text actually lives."""
    try:
        raw = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    # A string can be split into several runs when part of it is styled, so the
    # text of one entry is all its <t> nodes joined.
    return ["".join(t.text or "" for t in si.iter(NS + "t")) for si in ET.fromstring(raw)]


def find_sheet(zf: zipfile.ZipFile, suffix: str) -> tuple[str, str]:
    """Path and name of the worksheet whose name ends with `suffix`."""
    book = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels.iter(RELS_NS + "Relationship")}

    for sheet in book.iter(NS + "sheet"):
        name = sheet.get("name") or ""
        if not name.endswith(suffix):
            continue
        target = targets.get(sheet.get(DOC_REL_NS + "id") or "")
        if not target:
            break
        path = target[1:] if target.startswith("/") else "xl/" + target
        return path, name
    raise SystemExit(f"no worksheet named *{suffix} in the workbook")


def rows(zf: zipfile.ZipFile, path: str, strings: list[str]):
    """Each row of a worksheet as {column letter: text}."""
    for row in ET.fromstring(zf.read(path)).iter(NS + "row"):
        cells: dict[str, str] = {}
        for cell in row.iter(NS + "c"):
            ref = cell.get("r") or ""
            column = re.match(r"[A-Z]+", ref)
            if not column:
                continue
            kind = cell.get("t")
            value = cell.find(NS + "v")
            inline = cell.find(NS + "is")
            if kind == "s" and value is not None and value.text is not None:
                text = strings[int(value.text)]
            elif inline is not None:
                text = "".join(t.text or "" for t in inline.iter(NS + "t"))
            elif value is not None:
                text = value.text or ""
            else:
                text = ""
            cells[column.group()] = text
        yield cells


def clean(text: str) -> str:
    """Collapse the stray double spaces the register is full of."""
    return " ".join(text.split())


def has_letters(text: str) -> bool:
    """Whether there is anything in here to read, in any script."""
    return any(ch.isalnum() for ch in text)


def country_code(name: str) -> str:
    """The two letter code for a country name, or "" for one not listed."""
    text = " ".join(name.split()).casefold()
    if text.endswith(" (the)"):
        text = text[: -len(" (the)")]
    return COUNTRY_LOOKUP.get(text, "")


def sheet_date(value: str) -> str:
    """A spreadsheet serial as a plain date, or "" when it is not one.

    The dates in the export are Excel serials with a time of day on them, which
    is a precision the revocation of a code does not have.
    """
    try:
        days = float(value)
    except (TypeError, ValueError):
        return ""
    if days <= 0:
        return ""
    return (EXCEL_EPOCH + datetime.timedelta(days=int(days))).isoformat()


def code_of(text: str) -> str:
    """A code as the register writes it: four characters, upper case.

    Codes that are all digits keep their leading zero (0060 is Iarnród
    Éireann), and get it back if a spreadsheet cell ever loses it.
    """
    text = text.strip().upper()
    return text.zfill(4) if text.isdigit() else text


def main() -> int:
    try:
        book = fetch(URL)
    except Exception as exc:  # noqa: BLE001 - the workflow reports and moves on
        print(f"could not fetch the organisation codes: {exc}", file=sys.stderr)
        return 1

    try:
        zf = zipfile.ZipFile(io.BytesIO(book))
        strings = shared_strings(zf)
        path, sheet_name = find_sheet(zf, "OrganisationCodes")
    except (zipfile.BadZipFile, KeyError, SystemExit) as exc:
        print(f"not the spreadsheet this expects: {exc}", file=sys.stderr)
        return 1

    sheet = rows(zf, path, strings)
    header = next(sheet, {})
    columns = {clean(name): letter for letter, name in header.items()}
    wanted = ("Code", "Second code", "Organisation Name", "Organisation Acronym")
    missing = [name for name in wanted if name not in columns]
    if missing:
        print(f"columns missing from the export: {missing}", file=sys.stderr)
        return 1

    try:
        revoked_path, _ = find_sheet(zf, "RevokedCodes")
    except SystemExit as exc:
        print(f"not the spreadsheet this expects: {exc}", file=sys.stderr)
        return 1

    orgs: dict[str, dict[str, str]] = {}
    rics: dict[str, dict[str, str]] = {}
    aliases: list[tuple[str, dict[str, str], dict[str, dict[str, str]]]] = []
    unplaced: set[str] = set()
    for row in sheet:
        name = clean(row.get(columns["Organisation Name"], ""))
        if not name:
            continue
        entry = {"n": name}
        acronym = clean(row.get(columns["Organisation Acronym"], ""))
        # Some organisations repeat the name in the acronym column, which says
        # nothing the name does not, and some fill it with "-" or "---", which
        # says less than that.
        if acronym and acronym.casefold() != name.casefold() and has_letters(acronym):
            entry["a"] = acronym

        country = clean(row.get(columns.get("Country", ""), ""))
        if country:
            iso = country_code(country)
            if iso:
                entry["c"] = iso
            else:
                unplaced.add(country)

        # The register says which of the two allocations a row is. The ones it
        # calls RICS codes are UIC's, mirrored here, and they go to the table
        # that answers for UIC's half of the numbering. A row that says
        # anything else, including nothing, is ERA's.
        target = (
            rics
            if clean(row.get(columns.get("Code details", ""), "")) == "RICS Code"
            else orgs
        )

        code = code_of(row.get(columns["Code"], ""))
        if code:
            target[code] = entry
        second = code_of(row.get(columns["Second code"], ""))
        if second:
            aliases.append((second, entry, target))

    # A second code belongs to the organisation that lists it, but where one is
    # also somebody's primary code the primary allocation is the firmer fact.
    for code, entry, target in aliases:
        target.setdefault(code, entry)

    revoked = rows(zf, revoked_path, strings)
    revoked_header = next(revoked, {})
    revoked_columns = {clean(name): letter for letter, name in revoked_header.items()}
    missing = [n for n in ("Organisation Name", "Revoked Code") if n not in revoked_columns]
    if missing:
        print(f"columns missing from the revoked sheet: {missing}", file=sys.stderr)
        return 1

    withdrawn = 0
    for row in revoked:
        name = clean(row.get(revoked_columns["Organisation Name"], ""))
        code = code_of(row.get(revoked_columns["Revoked Code"], ""))
        if not name or not code or code in orgs or code in rics:
            continue
        # The date is a fact about the code, so it is read here; saying so in
        # front of a reader is the app's business. An empty string still means
        # revoked, for a row the sheet gives no usable date for.
        when = sheet_date(row.get(revoked_columns.get("Revocation Date", ""), ""))
        orgs[code] = {"n": name, "revoked": when}
        withdrawn += 1

    # Hand kept entries go on top of the mirrored ones: the register is not
    # where a UIC allocation is decided, only where it is copied. They merge
    # into the row rather than replacing it, so an override can say the one
    # thing it knows better and leave the name to the register.
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    tables = {"era": orgs, "rics": rics}
    for code, entry in overrides.items():
        if code.startswith("_"):
            continue
        code = code_of(code)
        fields = {k: v for k, v in entry.items() if not k.startswith("_")}
        wanted = entry.get("_target")
        if wanted is not None and wanted not in tables:
            print(f"override {code} asks for table {wanted!r}, which is not one", file=sys.stderr)
            return 1

        # Patch the code where it already sits. UIC's register has plenty to
        # say about rows ERA files as its own, and moving one between the
        # tables would be claiming which body allocated it, which is the
        # register's call rather than this file's. A code neither of them
        # carries has to say where it goes.
        if code in orgs:
            target = orgs
        elif code in rics:
            target = rics
        elif wanted:
            target = tables[wanted]
        else:
            print(f"override {code} is in neither table and names no _target", file=sys.stderr)
            return 1

        target[code] = {**target.get(code, {}), **fields}
        if not target[code].get("n"):
            print(f"override {code} names no organisation to go with the code", file=sys.stderr)
            return 1

    # Sanity floors: the register has held several thousand organisations since
    # ERA took the EU half of the numbering over, and a couple of hundred
    # mirrored RICS codes, so a collapse in either means the export changed
    # shape rather than Europe running out of railways.
    if len(orgs) < 4000 or len(rics) < 100:
        print(
            f"only {len(orgs)} organisations and {len(rics)} RICS codes, refusing to write",
            file=sys.stderr,
        )
        return 1

    # The sheet is named for the day it was exported; keep that rather than the
    # day this ran, so the file says how old the data is and not the job.
    stamp = SHEET_DATE.match(sheet_name)
    edition = (
        f"{stamp.group(3)}-{stamp.group(2)}-{stamp.group(1)}"
        if stamp
        else datetime.date.today().isoformat()
    )

    table = {
        "_note": NOTE,
        "_edition": edition,
        "orgs": {code: orgs[code] for code in sorted(orgs)},
    }
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(
        f"wrote {OUT.relative_to(REPO)} with {len(orgs)} organisations "
        f"({withdrawn} of them revoked codes, {edition})"
    )

    rics_table = {
        "_note": RICS_NOTE,
        "_edition": edition,
        "orgs": {code: rics[code] for code in sorted(rics)},
    }
    OUT_RICS.write_text(
        json.dumps(rics_table, ensure_ascii=False, indent=0) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUT_RICS.relative_to(REPO)} with {len(rics)} RICS codes")
    if unplaced:
        print(f"no country code for: {', '.join(sorted(unplaced))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
