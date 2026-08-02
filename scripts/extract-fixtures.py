#!/usr/bin/env python3
"""Regenerate test fixtures: extract barcode payloads from sample-tickets/
into .bin files plus asn1tools-decoded ground truth JSON (the reference the
TS UPER decoder is tested against).

Usage:
    python -m venv venv && venv/bin/pip install zxing-cpp pymupdf asn1tools pillow
    venv/bin/python scripts/extract-fixtures.py

Muster fixtures land in tests/fixtures/public (committed); personal tickets in
tests/fixtures/private (gitignored). Expects the Muster zips extracted next to
them (see MUSTER_DIRS below).
"""
import io
import json
import pathlib
import sys
import tempfile
import zipfile
import zlib

import zxingcpp
import fitz  # pymupdf
from PIL import Image
import asn1tools

REPO = pathlib.Path(__file__).parent.parent
SAMPLES = REPO / "sample-tickets"
ASN_DIR = REPO / "scripts" / "asn-specs"
OUT_PUBLIC = REPO / "tests" / "fixtures" / "public"
OUT_PRIVATE = REPO / "tests" / "fixtures" / "private"
LOCAL = pathlib.Path(tempfile.mkdtemp(prefix="ticketish-muster-"))
for zip_name, sub in [
    ("mdb_320951_muster-tickets_nach_uic_918-3_2.2023-01-04-09-38-20.zip", "9183"),
    ("Muster 918-9.2025-04-03-11-58-17.zip", "9189"),
]:
    path = SAMPLES / zip_name
    if path.exists():
        with zipfile.ZipFile(path) as z:
            z.extractall(LOCAL / sub)

FCB = {
    13: asn1tools.compile_files([ASN_DIR / "uicRailTicketData_v1.3.5.asn"], codec="uper"),
    2: asn1tools.compile_files([ASN_DIR / "uicRailTicketData_v2.0.3.asn"], codec="uper"),
    3: asn1tools.compile_files([ASN_DIR / "uicRailTicketData_v3.0.7.asn"], codec="uper"),
}
HDR = {
    1: asn1tools.compile_files([ASN_DIR / "uicBarcodeHeader_v1.0.0.asn"], codec="uper"),
    2: asn1tools.compile_files([ASN_DIR / "uicBarcodeHeader_v2.0.1.asn"], codec="uper"),
}


def jsonable(o):
    if isinstance(o, (bytes, bytearray)):
        return {"__bytes__": o.hex()}
    if isinstance(o, tuple) and len(o) == 2 and isinstance(o[0], str):
        return {"__choice__": o[0], "value": jsonable(o[1])}
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    return o


def decode_image(img: Image.Image):
    res = zxingcpp.read_barcodes(img)
    return [(r.format.name, r.bytes) for r in res]


def barcodes_from_pdf(path):
    out = []
    doc = fitz.open(path)
    for page in doc:
        # try embedded images first (full resolution)
        for xref, *_ in page.get_images(full=True):
            try:
                base = doc.extract_image(xref)
                img = Image.open(io.BytesIO(base["image"]))
                if img.width < 100 or img.height < 100:
                    continue
                out.extend(decode_image(img))
            except Exception:
                pass
        if not out:
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            out.extend(decode_image(img))
    return out


def barcode_from_pkpass(path):
    with zipfile.ZipFile(path) as z:
        pj = json.loads(z.read("pass.json"))
    bcs = pj.get("barcodes") or [pj.get("barcode")]
    out = []
    for bc in bcs:
        if not bc:
            continue
        enc = bc.get("messageEncoding", "iso-8859-1")
        out.append((bc.get("format", "?"), bc["message"].encode(enc)))
    return out


def classify(payload: bytes):
    if payload[:3] == b"#UT":
        return "918.3"
    # DOSIPAS/918.9 begins with UPER-encoded IA5 "U1"/"U2" format tag after length; just try decode
    return "dosipas?"


def analyze(name: str, payload: bytes):
    """Parse envelope, return ground-truth dict."""
    info = {"name": name, "size": len(payload), "sha_head": payload[:16].hex()}
    if payload[:3] == b"#UT":
        version = int(payload[3:5])
        rics = payload[5:9].decode()
        key_id = payload[9:14].decode()
        sig_len = 50 if version == 1 else 64
        rest = payload[14 + sig_len:]
        data_len = int(rest[0:4])
        compressed = rest[4:4 + data_len]
        raw = zlib.decompress(compressed)
        records = []
        off = 0
        while off < len(raw):
            rid = raw[off:off + 6].decode()
            rver = int(raw[off + 6:off + 8])
            rlen = int(raw[off + 8:off + 12])
            rdata = raw[off + 12:off + rlen]
            off += rlen
            rec = {"id": rid, "version": rver, "len": rlen, "data_hex": rdata.hex()}
            if rid == "U_FLEX":
                spec = FCB.get(rver if rver != 1 else 13) or FCB[13]
                try:
                    rec["flex"] = jsonable(spec.decode("UicRailTicketData", rdata))
                except Exception as e:
                    rec["flex_error"] = str(e)
            records.append(rec)
        info.update({"format": "918.3", "envelope_version": version, "rics": rics,
                     "key_id": key_id, "records": records})
    else:
        for v in (2, 1):
            try:
                data = HDR[v].decode("UicBarcodeHeader", payload)
                info["format"] = f"dosipas-u{v}"
                info["header"] = jsonable(data)
                recs = []
                l1 = data["level2SignedData"]["level1Data"]
                seq = list(l1["dataSequence"])
                if "level2Data" in data["level2SignedData"]:
                    seq.append(data["level2SignedData"]["level2Data"])
                for r in seq:
                    fmt = r["dataFormat"]
                    rec = {"dataFormat": fmt, "data_hex": r["data"].hex()}
                    if fmt.startswith("FCB"):
                        fv = int(fmt[3:])
                        spec = FCB.get(fv if fv != 1 else 13)
                        if spec:
                            try:
                                rec["flex"] = jsonable(spec.decode("UicRailTicketData", r["data"]))
                            except Exception as e:
                                rec["flex_error"] = str(e)
                    recs.append(rec)
                info["records"] = recs
                break
            except Exception as e:
                info.setdefault("errors", []).append(f"hdr v{v}: {e}")
    return info


def slug(s):
    import re
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    sources = []  # (name, private?, barcode list)
    if (SAMPLES / "h2x4vfen2O.pkpass").exists():
        sources.append(("pkpass-hh-cph", True, barcode_from_pkpass(SAMPLES / "h2x4vfen2O.pkpass")))
    if (SAMPLES / "interrail.png").exists():
        sources.append(("interrail", True, decode_image(Image.open(SAMPLES / "interrail.png"))))
    sncb = SAMPLES / "2026-07-02 Tickets Milano Centrale (Italy) - Zuerich Hb (Switzerland).pdf"
    if sncb.exists():
        sources.append(("sncb-milano-zuerich", True, barcodes_from_pdf(sncb)))
    for p in sorted((LOCAL / "9183").rglob("*")) + sorted((LOCAL / "9189").rglob("*")):
        if p.suffix.lower() == ".pdf":
            sources.append((slug(p.stem), False, barcodes_from_pdf(p)))
        elif p.suffix.lower() in (".png", ".jpeg", ".jpg"):
            sources.append((slug(p.stem), False, decode_image(Image.open(p))))

    seen = set()
    for name, private, codes in sources:
        if not codes:
            print(f"!! no barcode found: {name}")
            continue
        out = OUT_PRIVATE if private else OUT_PUBLIC
        out.mkdir(parents=True, exist_ok=True)
        for i, (fmt, payload) in enumerate(codes):
            if payload in seen:
                continue
            seen.add(payload)
            fname = f"{name}" + (f"-{i}" if i else "")
            (out / f"{fname}.bin").write_bytes(payload)
            gt = analyze(fname, payload)
            gt["barcode_format"] = fmt
            (out / f"{fname}.expected.json").write_text(
                json.dumps(gt, indent=1, ensure_ascii=False))
            recs = [r.get("id") or r.get("dataFormat") for r in gt.get("records", [])]
            print(f"ok {fname}: {fmt} {gt.get('format')} records={recs}")


if __name__ == "__main__":
    main()
