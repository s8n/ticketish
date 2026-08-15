#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/bob/participants.json from the BoB participant list.

A BoB ticket names its issuer by participant id and nothing else: the barcode
carries `iid: "10"` where a UIC ticket would carry a RICS code. The register
that says 10 is Skånetrafiken is a page in Samtrafiken's BoB space, and this
reads the id and the organisation name off it.

Provenance
----------
The page is on a Confluence space that needs a login, and it publishes no reuse
licence. What is taken is the pair a ticket needs to be legible, an id and the
organisation that holds it, which is a fact about a number rather than a copy of
the page. Nothing else on it is kept, and the page itself is not redistributed.

Two columns are dropped for reasons worth stating, because both are the kind of
thing a later hand would think to add back:

Contact Information is a named person per organisation. It is personal data,
this repo has no reason to hold it, and a ticket parser has no use for it.

The implementation status columns say which APIs each participant runs today,
as a letter per column. They are maintained continuously and describe the state
of a deployment rather than the meaning of an id, so a copy of them here would
be answering a question nobody asked with data that is wrong by next month. An
id keeps meaning what it means.

Reserved ranges are dropped too. The page lists blocks such as 2000-2299 and
3000-3999 alongside the single ids, and a range is not something a barcode
carries. The individual test ids inside those blocks are kept, since a ticket
from a test environment does carry one, and the name is then the supplier
running the test rather than an operator: the register's own wording.

Access
------
Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN to an account that can read the
BoB space. Tokens are made at
https://id.atlassian.com/manage-profile/security/api-tokens

The page can also be exported by hand and passed in, which is how it is done
from a machine that cannot reach the wiki:

    python scripts/build-bob-participants.py --from-file page.storage.html

Usage:
    python scripts/build-bob-participants.py
"""
import argparse
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "bob" / "participants.json"

SITE = "https://samtrafiken.atlassian.net/wiki"
PAGE = "812220424"
PAGE_URL = f"{SITE}/spaces/BOB/pages/{PAGE}"

TIMEOUT = 30

NOTE = (
    "BoB participant ids to the organisations that hold them. A BoB ticket names "
    "its issuer by this id and by nothing else. Read from the List of Participant "
    "IDs (PID) page in Samtrafiken's BoB space, "
    f"{PAGE_URL}, which needs a login and publishes no reuse licence, so this is "
    "the id and the organisation name only, which is a fact about a number. The "
    "contact person, the per-API implementation status and the reserved id ranges "
    "are all deliberately dropped: see scripts/build-bob-participants.py for why. "
    "Rebuilt by that script; do not edit by hand, put corrections in the OVERRIDES "
    "map in src/lib/tickets/bob/participants.ts."
)


class Tables(HTMLParser):
    """Every table in a Confluence body, as rows of cell text.

    HTMLParser rather than an XML parser on purpose. Confluence storage format
    carries prefixed tags such as `ac:structured-macro` whose namespaces are
    never declared in the fragment, and named entities an XML parser has no
    definition for, both of which stop a strict parse dead.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._rows = None
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._rows = []
        elif tag == "tr" and self._rows is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == "table" and self._rows is not None:
            if self._rows:
                self.tables.append(self._rows)
            self._rows = None
        elif tag == "tr" and self._row is not None:
            self._rows.append(self._row)
            self._row = None
        elif tag in ("td", "th") and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)

    def handle_startendtag(self, tag, attrs):
        # a break inside a cell separates two values, so keep them apart
        if tag == "br" and self._cell is not None:
            self._cell.append(" ")


def fetch_page():
    email = os.environ.get("CONFLUENCE_EMAIL")
    token = os.environ.get("CONFLUENCE_API_TOKEN")
    headers = {"Accept": "application/json"}
    if email and token:
        raw = f"{email}:{token}".encode()
        headers["Authorization"] = "Basic " + base64.b64encode(raw).decode()

    url = f"{SITE}/api/v2/pages/{PAGE}?body-format=storage"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            page = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            sys.exit(
                f"{error.code} reading {url}\n"
                "Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN to an account that\n"
                "can read the BoB space, or export the page and pass --from-file."
            )
        raise
    except urllib.error.URLError as error:
        sys.exit(f"could not reach {url}\n{error.reason}\nTry --from-file.")
    return page.get("body", {}).get("storage", {}).get("value", "")


def tables_of(body):
    parser = Tables()
    parser.feed(body)
    return [rows for rows in parser.tables if rows and rows[0]]


def participant_table(body):
    """The table whose header starts with PID, out of all the page's tables."""
    for rows in tables_of(body):
        header = [cell.lower() for cell in rows[0]]
        if header[:2] == ["pid", "organisation name"]:
            return rows
    sys.exit(
        "no participant table on the page: the first two columns of one of its\n"
        "tables should be PID and Organisation Name. The page layout may have\n"
        "changed, in which case this script needs updating rather than forcing."
    )


def build(rows):
    """Id to organisation name, for the rows that carry a single numeric id."""
    participants = {}
    skipped = []
    for row in rows[1:]:
        if len(row) < 2:
            continue
        pid, name = row[0].strip(), row[1].strip()
        if not name:
            continue
        if not pid.isdigit():
            # a reserved range such as 2000-2299, which no barcode carries
            if pid:
                skipped.append(pid)
            continue
        # the register lists an id more than once only by mistake; keeping the
        # first is arbitrary, so say so rather than letting one win silently
        if pid in participants and participants[pid] != name:
            print(f"warning: id {pid} listed twice, keeping {participants[pid]!r}")
            continue
        participants[pid] = name
    return participants, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--from-file",
        type=pathlib.Path,
        help="a Confluence storage or view body exported by hand",
    )
    args = parser.parse_args()

    body = args.from_file.read_text(encoding="utf-8") if args.from_file else fetch_page()
    participants, skipped = build(participant_table(body))
    if not participants:
        sys.exit("the participant table has no numeric ids in it")

    ordered = dict(sorted(participants.items(), key=lambda pair: int(pair[0])))
    text = json.dumps({"_note": NOTE, "participants": ordered}, ensure_ascii=False, indent=0)
    OUT.write_text(text + "\n", encoding="utf-8")

    print(f"wrote {len(ordered)} participants to {OUT.relative_to(REPO)}")
    if skipped:
        print(f"skipped {len(skipped)} reserved range(s): {', '.join(skipped)}")


if __name__ == "__main__":
    main()
