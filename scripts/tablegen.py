# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""What the table generators share: fetching a source and writing a table.

The build-*.py scripts import this from their own directory, which Python
puts on the path when a script is run as `python scripts/build-....py`.
"""
import json
import pathlib
import urllib.request

USER_AGENT = "ticketish-build"


def fetch(url: str, timeout: int = 180) -> bytes:
    """The body at a URL, asked for as this build so a source can tell."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def write_table(path: pathlib.Path, table: dict, compact: bool = False) -> None:
    """A table as UTF-8 JSON with a trailing newline.

    One entry per line by default, so a monthly rebuild diffs as the rows
    that changed; compact for the tables large enough that nobody reads them.
    """
    if compact:
        text = json.dumps(table, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(table, ensure_ascii=False, indent=0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def clean(text: str) -> str:
    """Collapse the stray double spaces registers are full of."""
    return " ".join(text.split())


def has_letters(text: str) -> bool:
    """Whether there is anything in here to read, in any script."""
    return any(ch.isalnum() for ch in text)
