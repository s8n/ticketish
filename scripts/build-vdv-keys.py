#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ave
# SPDX-License-Identifier: MIT OR EUPL-1.2

"""Build src/lib/tickets/vdv/ca-keys.json from the VDV KA CA certificates.

The certificates are published in VDV's public LDAP directory
(ldaps://ldap-vdv-ion.telesec.de:636, ou=VDV KA). CV certificates whose
content is embedded in an ISO 9796-2 signature are recovered by walking the
chain from certificates with plain content (the roots). The output maps each
CA's certificate holder reference to its RSA public key.

Usage:
    venv/bin/pip install ldap3
    venv/bin/python scripts/build-vdv-keys.py [cert-cache-dir]
"""
import hashlib
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).parent.parent
OUT = REPO / "src" / "lib" / "tickets" / "vdv" / "ca-keys.json"

CACHE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "vdv-cert-cache"

TAG_CERTIFICATE = 0x7F21
TAG_CONTENT = 0x5F4E
TAG_SIGNATURE = 0x5F37
TAG_REMAINDER = 0x5F38


def fetch_certs():
    import ldap3
    CACHE.mkdir(exist_ok=True)
    srv = ldap3.Server("ldaps://ldap-vdv-ion.telesec.de:636", use_ssl=True, connect_timeout=15)
    conn = ldap3.Connection(srv, auto_bind=True, receive_timeout=30)
    conn.search("ou=VDV KA,o=VDV Kernapplikations GmbH,c=de", "(objectClass=*)",
                search_scope=ldap3.SUBTREE, attributes=["cn", "cACertificate"])
    for e in conn.entries:
        if "cACertificate" not in e or not e.cACertificate.raw_values:
            continue
        (CACHE / f"prod_{e.cn}.der").write_bytes(e.cACertificate.raw_values[0])


def parse_tlv(data):
    """Minimal BER-TLV parser: returns list of (tag, value)."""
    out = []
    i = 0
    while i < len(data):
        tag = data[i]
        i += 1
        if tag & 0x1F == 0x1F:
            tag = (tag << 8) | data[i]
            i += 1
        length = data[i]
        i += 1
        if length & 0x80:
            n = length & 0x7F
            length = int.from_bytes(data[i:i+n], "big")
            i += n
        out.append((tag, data[i:i+length]))
        i += length
    return out


def cert_parts(der):
    elms = parse_tlv(der)
    if elms and elms[0][0] == TAG_CERTIFICATE:
        elms = parse_tlv(elms[0][1])
    parts = {}
    for tag, value in elms:
        parts[tag] = value
    return parts


def car_str(data):
    cc = data[0:2].decode("ascii")
    issuer = data[2:5].decode("ascii")
    si = (data[5] & 0xF0) >> 4
    dd = data[5] & 0x0F
    serial = data[6]
    year = 2000 + ((data[7] >> 4) * 10 + (data[7] & 0x0F))
    return f"{cc}/{issuer}/{si}/{dd}/{serial}/{year}"


MODULUS_LEN = {3: 192, 4: 128, 5: 128, 6: 128, 7: 248}


def content_info(content):
    profile = content[0]
    car = car_str(content[1:9])
    chr_data = content[9:21]
    is_ca = chr_data[0:4] == b"\x00\x00\x00\x00"
    chr_ref = car_str(chr_data[4:]) if is_ca else None
    # skip past the OID (variable length) to the key material
    oid_offset = 32
    while True:
        b = content[oid_offset]
        oid_offset += 1
        if not (b & 0x80):
            # crude but effective: known OIDs end within a few bytes; check if
            # the remaining length matches a known modulus size + exponent
            remaining = len(content) - oid_offset
            if any(remaining - ml in (1, 2, 3, 4) for ml in MODULUS_LEN.values()):
                break
    mod_len = MODULUS_LEN[profile]
    modulus = content[oid_offset:oid_offset+mod_len]
    exponent = content[oid_offset+mod_len:]
    return {
        "profile": profile,
        "car": car,
        "chr": chr_ref,
        "is_ca": is_ca,
        "name": content[21:27].decode("ascii", "replace"),
        "modulus_hex": modulus.hex(),
        "exponent_hex": exponent.hex() or "03",
        "modulus_len": mod_len,
    }


def recover(signature, remainder, modulus, exponent):
    m = pow(int.from_bytes(signature, "big"), exponent, modulus)
    data = m.to_bytes(len(signature), "big")
    if data[0] != 0x6A or data[-1] != 0xBC:
        return None
    data = data[1:-1]
    body, digest = data[:-20], data[-20:]
    message = body + remainder
    if hashlib.sha1(message).digest() != digest:
        return None
    return message


def main():
    if not CACHE.exists() or not list(CACHE.glob("*.der")):
        fetch_certs()

    certs = []
    for f in sorted(CACHE.glob("prod_*.der")):
        if f.name.startswith("prod_VDV ETS X509"):
            continue  # X.509 root, not a CV certificate
        parts = cert_parts(f.read_bytes())
        certs.append({"file": f.name, "parts": parts})

    keys = {}  # chr -> key info
    resolved = True
    while resolved:
        resolved = False
        for cert in certs:
            parts = cert["parts"]
            content = parts.get(TAG_CONTENT)
            if content is None and TAG_REMAINDER in parts:
                # try to recover with an already-known CA key
                sig = parts[TAG_SIGNATURE]
                for key in list(keys.values()):
                    msg = recover(sig, parts[TAG_REMAINDER],
                                  int(key["modulus_hex"], 16), int(key["exponent_hex"], 16))
                    if msg:
                        content = msg
                        cert["parts"][TAG_CONTENT] = msg
                        break
            if content is None:
                continue
            info = content_info(content)
            if info["is_ca"] and info["chr"] and info["chr"] not in keys:
                keys[info["chr"]] = {
                    "name": info["name"],
                    "signed_by": info["car"],
                    "profile": info["profile"],
                    "modulus_hex": info["modulus_hex"],
                    "exponent_hex": info["exponent_hex"],
                }
                resolved = True

    unresolved = [c["file"] for c in certs if TAG_CONTENT not in c["parts"]]
    if unresolved:
        print(f"warning: could not resolve {len(unresolved)} certs: {unresolved}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(keys, indent=0))
    print(f"wrote {len(keys)} CA keys to {OUT}")


if __name__ == "__main__":
    main()
