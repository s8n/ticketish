# Agent notes for ticketish

## Writing style

No em dashes anywhere in this repo: not in code comments, docs, UI copy, or
commit messages. Use hyphens, commas, colons, or restructure the sentence.
For missing-value placeholders in the UI, use an en dash. Generated fixture
data under `tests/fixtures/` is byte-faithful barcode content and exempt.

## Sample tickets and what may ship

- `sample-tickets/` holds real scanned tickets, organised by country. It is
  gitignored and contains personal data (names, birth dates, booking
  references). Never commit anything from it and never copy it into
  `static/` or `build/`.
- The only exceptions are the official DB Muster (specimen) tickets from the
  two zip files in `sample-tickets/`. These are published by DB and safe to
  include.
- `tests/fixtures/public/` (committed): fixtures extracted from the DB
  Muster tickets only.
- `tests/fixtures/private/` (gitignored): fixtures extracted from personal
  tickets. Tests that use them skip when absent.
- `static/samples/` ships with the deployed site and must only ever contain
  Muster tickets. `tests/samples-guard.test.ts` enforces this; keep it
  passing.
- Fixtures are regenerated with `scripts/extract-fixtures.py` (see its
  docstring for the venv setup).

## When adding a new ticket type

Besides the parser and view, update the two places that list supported
formats: the empty-state text in `src/routes/+page.svelte` and the
"What it reads" section in `README.md`.

## Never put real tickets in tests

Tests must not use ave's tickets, and must not contain values taken from
them: no PNRs, ticket numbers, station codes, dates, names or prices copied
off a real ticket, even in a comment or a commit message.

Build the payload instead. `tests/helpers/` has the tools: bit writers, TLV
and UIC 918.3 envelope builders, and throwaway RSA keys for the formats that
hide their data inside a signature (`buildVdv`, `buildRsp6`). Parsers that
read a bundled key store accept an override so a test can pass its own.

Real tickets are still useful for *finding* a layout. Once you have it,
express the finding as a synthetic payload. If a behaviour genuinely cannot
be reproduced synthetically, ask before using a real ticket rather than
adding one.

`tests/fixtures/public/` holds DB's published Muster specimens, which are
fine to use and are committed.

## Projects worth reading

- [zuegli](https://github.com/TheEnbyperor/zuegli) (EUPL-1.2): the main
  reference for ticket format knowledge and issuer quirks. Look in
  `main/uic/` (918.3 envelope, U_TLAY, 0080BL/0080VU, via-route parsing),
  `main/rsp/` (UK RSP6 bit layouts), and `main/swisspass/` (NOVA protobuf
  schema). Several of this repo's parsers are ports of its code. Its
  maintainer handles signature verification; that is deliberately out of
  scope here.
- [UIC-barcode](https://github.com/UnionInternationalCheminsdeFer/UIC-barcode)
  (EUPL-1.2 / Apache-2.0): the official UIC reference implementation. The
  ASN.1 specs vendored in `scripts/asn-specs/` come from its `asn-specs/`
  directory; newer FCB versions appear there first.
- [rsp6-decoder](https://git.eta.st/eta/rsp6-decoder) (MIT): source of the
  vendored UK RSP6 public keys (`src/lib/tickets/rsp/keys.json`) and the
  reference for the base26 decode quirk (digits read back to front, then
  bytes reversed).
