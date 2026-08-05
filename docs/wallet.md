# Wallet passes

Under the **Barcode** tab, tickets in the formats that have an intentional
mapping (UIC 918.3 / 918.9, VDV-KA, SwissPass and Renfe so far) can be written out as a wallet
pass. It sits with the barcode because a pass is the same payload in another
container rather than a reading of it. Passes are built and signed in the
browser, with credentials you supply: nothing is uploaded, and the app has no
signing key of its own.

A pass carries the original barcode byte for byte. Everything else on it was
read out of that barcode and is only as good as this app's reading of it, so
the original ticket is still the one that counts.

Credentials live in memory unless you tick "keep on this device", which puts
them in IndexedDB; "forget" deletes that database. Nothing else this app
touches is ever written to disk.

## Apple Wallet

You need a Pass Type ID certificate from an Apple Developer account (99¤/yr)
and its private key, both as PEM. Make the key and the signing request yourself:

```sh
openssl genrsa -out key.pem 2048
openssl req -new -key key.pem -out request.certSigningRequest \
  -subj "/emailAddress=you@example.com/CN=your-name/C=UT"
```

(where UT is your country code)

Register a Pass Type ID under Certificates, Identifiers and Profiles, upload
the request, and download the certificate. Apple hands it back as DER, so one
conversion and you are done:

```sh
openssl x509 -inform der -in pass.cer -out cert.pem
```

Load `cert.pem` and `key.pem` in the app. A passphrase protected key has to be
decrypted first, with `openssl pkcs8 -topk8 -nocrypt -in key.pem -out
key-decrypted.pem`. If you already have a `.p12` from Keychain rather than a
key of your own, `openssl pkcs12 -legacy` splits it into the same two files.

The pass type and team identifiers are read out of the certificate, so there is
nothing to type. The key is imported as non-extractable: the browser signs with
it and cannot hand the bytes back. Apple's WWDR G4 intermediate is bundled, so
signing works with no network. It expires on 10 December 2030, and the app says
so rather than letting Wallet refuse the pass. Safari is the only iOS browser
that hands a `.pkpass` to Wallet.

## Google Wallet

You need an issuer ID from the
[Google Pay and Wallet console](https://pay.google.com/business/console/) under
Google Wallet API, and a service account JSON key from the Google Cloud console
(IAM and Admin, Service Accounts, pick the account, Keys, Add key, JSON).

The service account then has to be invited into the issuer, under Users, Invite
a user, with access level Developer. That step is easy to skip here, because
this app never calls the REST API, and it still matters: Google checks that
whoever signed the pass is authorized for the issuer ID inside it. An issuer
that has not been published only saves passes for accounts registered on it as
testers.

A journey becomes a transit pass, which is the one Google lays out as a route;
anything without one becomes a generic pass. Two things about it are not
guaranteed, and the app says so beside the button:

- Google carries a barcode as a JSON string and documents no binary encoding.
  The bytes go in one per character, which is what other issuers do and what
  works today. Scan the finished pass back in here before you travel on it.
- A save link carries the whole signed pass in its URL and Google calls 1800
  characters safe. A DB ticket signs to around three thousand. It is offered
  anyway, with the real number shown. Getting under the limit means the REST
  API, an OAuth token exchange and a network round trip: a different design.

If neither works out, the Wallet app's own "add from a photo" flow reads the
PNG the Barcode tab exports. The bytes survive; what you get is the bare code
with none of the fields.

## Add to calendar

The `.ics` export needs nothing at all: no certificate, no issuer account, no
phone in particular. A journey becomes a timed event from its departure to its
arrival, a period ticket an all-day event across its validity, and the rest of
the mapping goes in the description. FCB carries a UTC offset, so a DB ticket
gets a real time zone and a defined VTIMEZONE; anything that names no zone
stays a floating time, which RFC 5545 defines as the same wall clock wherever
it is read.
