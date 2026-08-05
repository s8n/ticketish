# ticketish

Reads what your train ticket really says. A fully client-side SvelteKit PWA
that decodes the 2D barcodes on rail tickets, mainly European ones.

Inspired by an attempt to parse a nightmarish Swedish train ticket that got
so many fields wrong.

## Features

- **Local and offline**: Everything runs in the browser: no server, no uploads,
  works offline once installed as a PWA. Privacy-friendly :)
- **Diverse input options**: images, PDFs (rendered with pdf.js and scanned),
  Apple Wallet `.pkpass` files, the live camera, raw payload files.
- **Wallet passes**: tickets in the formats that have an intentional mapping
  (UIC 918.3 / 918.9, VDV-KA, SwissPass and Renfe so far) can be written out as an Apple or
  Google wallet pass, built and signed in the browser with credentials you
  supply, none are supplied by default (see "What's not here" below).
  [docs/wallet.md](docs/wallet.md) has details on how to obtain relevant keys.
- **Deciphered DB Zugbindung**: the train binding and via fields in DB tickets
  get visualized nicely, so you know what trains you can take.
- **Add to calendar**: an `.ics` that you can add to your calendar for
  supported formats, for available fields (almost always better to use the
  official one, if the rail operator provides it)
- **Long list of supported tickets**: All those tickets I've been saving in my
  [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx), all those
  screenshots I've been taking of all the
  [Aztec](https://en.wikipedia.org/wiki/Aztec_Code)s I get for my ticket have
  paid off. Of course being able to utilize some of what [Zügli](https://zügli.app)
  has, plus [trainticket.wiki](https://trainticket.wiki/) did a bunch too.
  Then a brief visit to [wp:List of European railways](https://en.wikipedia.org/wiki/List_of_European_railways),
  and a few dozen google image searches... you get the idea. See the list below.

## What's not here

- **Signature validation**: This requires quite a bit of added logic and data,
  and would as such not be very compatible with an offline application.
  See [Zügli](https://zügli.app) if that's your jam, Q's better at knowing all
  the certificate Q-uirks than I.
- **Wallet passes without own keys**: Again, see [Zügli](https://zügli.app) :)
- **Human-written code, dignity, Umweltschutz, usw.**: This project is almost
  fully LLM-written, but I poured in quite a bit of love to make it nice to use.
  Initial state that took 2 hours was usable, but it came a long way since.
  You can try out the original state [here](https://94920c32.ticketish.pages.dev/)
  if you want.

## What it reads

- **UIC 918.3** - the classic `#UT` Aztec envelope (U_HEAD, U_TLAY/RCT2
  layout, DB `0080BL` fare data, DB `0080VU` Verbund products)
- **UIC 918.9 / FCB** - `U_FLEX` records (FCB versions 1.3, 2 and 3), decoded
  with a from-scratch unaligned-PER (ASN.1 UPER) decoder
- **DOSIPAS** - the `U1`/`U2` dynamic barcode header carrying FCB payloads
  (e.g. Interrail passes)
- **UK RSP6** - National Rail tickets ("06"): base26 RSA message recovery with
  the published RSP keys, then the bit-packed ticket record. Railcards ("08")
  have a layout but no sample to verify it against, and the card says so
- **SwissPass / NOVA** - Swiss mobile tickets (protobuf QR)
- **VDV-KA** - German Verbund tickets and the Deutschlandticket: BER-TLV
  envelope with ISO 9796-2 message recovery against the VDV CA certificates,
  MOTICS copy-protection containers included
- **SSB and SSB1** - older bit-packed UIC barcodes: reservations, travel and
  group tickets, passes, NS/DB Keycards and ČD's OneTicket (type 24, the Czech
  integrated tariff), plus the 107-byte SSB1 variant used by VR (Finland)
- **Renfe** - Spanish tickets, in their own fixed-width ASCII format rather
  than a UIC one
- **ELB (Element List Barcode)** - the fixed-width record of ERA TAP TSI
  technical document B.12 section 8, on Eurostar home print (`eRIV`, `eRIZ`)
  and SNCF card stock (`eEDV`). 85 characters for one leg, 121 for an out and
  back: PNR, ticket number, stations, per leg train, coach, seat, class and
  tariff, plus dates and passenger counts
- **SNCF e-billet** - magic `i0CV`, a 131 character Aztec on TGV INOUI and
  sncf-connect tickets, unrelated to ELB despite the shared stock. Carries
  passenger name and date of birth, but no coach or seat. Ported from zuegli
- **MÁV** - Hungarian tickets, versions 2 to 6: a short plaintext head, a gzip
  compressed body of counted blocks (traveler, trip, supplements, seats,
  passes) and an appended signature. Station ids are UIC codes up to version 4,
  which the bundled table names, and MÁV's own numbering from version 5
- **VIA Rail** - Canadian boarding passes, a 124 character fixed-width ASCII
  Aztec with VIA's own four letter station codes and bare local times
- **HŽPP** - Croatian tickets. The plaintext form (`B1`, 33 pipe separated
  fields) is read in full, including prices in kuna or euro depending on which
  side of the 2023 switchover it was sold. The encrypted form (`A1`) is
  recognised but cannot be opened, since HŽPP does not publish the key
- **NSB / Vy** - Norwegian tickets, barely decoded: bit-packed binary behind
  base64 with no published specification. Only the departure and arrival times
  are placed, and the card says as much
- **ČD `#CD01`** - the older Czech layout, 63 bytes with no published
  specification. The issuing stamp and both validity dates are read as OLE
  automation dates; the rest is shown as bytes rather than guessed at
- **TCDD** - Turkish e-tickets, a "$"-delimited ASCII record
- **Trenitalia** - departure date, train, coach, seat, PNR and entitlement
  number; the payload appears to carry no time or station codes
- **UZ (Укрзалізниця)** - Ukrainian boarding documents, a plain text QR with
  one field per line, matched by shape rather than counted
- **EAV / UNICO Campania** - a plain text QR, one field per line
- Anything else falls back to a plain-text / hex view

Formats without a public specification were reverse engineered by comparing
barcodes against the printed tickets they came from. Where fields remain
unknown, the UI says so rather than guessing.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # parser tests against synthetic barcodes
npm run check    # svelte-check
npm run build    # static site in build/
```

Tests build their own payloads and never use real tickets. **`static/samples/`
ships with the site and must only ever contain the public DB Muster specimens.**
`tests/samples-guard.test.ts` enforces this.

## Deploying to Cloudflare Pages

The site is fully static (`@sveltejs/adapter-static`), so the build command is
`npm run build` and the output directory is `build`. Either connect the repo in
the Cloudflare Pages dashboard with those settings, or deploy manually:

```sh
npm run build
npx wrangler pages deploy build
```

No functions, bindings or environment variables needed.

## Credits

Thanks to [zügli](https://github.com/TheEnbyperor/zuegli),
[eta](https://git.eta.st/eta), [NeoRail](https://github.com/NeoRail)
and [trainline-eu](https://github.com/trainline-eu/stations).

Everything else, and the licences that come with it, is in
[docs/credits.md](docs/credits.md). Read it before redistributing.
