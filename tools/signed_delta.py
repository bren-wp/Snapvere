#!/usr/bin/env python3
# Snapvere by Brendigo
"""Detached Ed25519 signatures for offline delta preparation and verification.

Reference release tooling only. The caller must pin a trusted public-key
fingerprint independently of the downloaded files. No key is bundled and
nothing is installed or executed. OpenSSL 3.x is an operator dependency.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from delta_patch import MAX_BYTES, DIGEST, open_source, snapshot, fingerprint, read_header, reconstruct, stage, validate_header

MAX_DESCRIPTOR = 8192
MAX_KEY = 16384
DOMAIN = b"Snapvere signed delta v1\n"


def bounded(path, limit):
    with open_source(path) as source:
        before = os.fstat(source.fileno())
        if before.st_size > limit:
            raise ValueError("Oversized signing input")
        value = source.read(limit + 1)
        if len(value) != before.st_size or fingerprint(before) != fingerprint(os.fstat(source.fileno())):
            raise ValueError("Signing input changed")
        return value


def openssl(*args):
    # No shell, no network, no automatic key retrieval, no user-controlled flags.
    executable = shutil.which("openssl")
    if executable is None:
        raise RuntimeError("OpenSSL 3.x is required for offline signing")
    result = subprocess.run([executable, *map(str, args)], stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    if result.returncode:
        raise ValueError("Cryptographic verification or signing failed")
    return result.stdout


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def validate_descriptor(d):
    if not isinstance(d, dict) or set(d) != {"schema", "patch_size", "patch_sha256", "delta"} or d["schema"] != "snapvere-signed-delta-v1":
        raise ValueError("Invalid signed descriptor")
    if type(d["patch_size"]) is not int or not 1 <= d["patch_size"] <= MAX_BYTES:
        raise ValueError("Invalid signed patch size")
    if not isinstance(d["patch_sha256"], str) or not DIGEST.fullmatch(d["patch_sha256"]):
        raise ValueError("Invalid signed patch hash")
    validate_header(d["delta"])
    if d["patch_size"] >= d["delta"]["new_size"]:
        raise ValueError("Not a differential payload")
    return d


def describe(patch):
    with open_source(patch) as stream:
        info, digest = snapshot(stream)
        header = read_header(stream)
        if fingerprint(info) != fingerprint(os.fstat(stream.fileno())):
            raise ValueError("Patch changed")
        return validate_descriptor({"schema": "snapvere-signed-delta-v1",
                                    "patch_size": info.st_size, "patch_sha256": digest, "delta": header})


def public_der(key, private=False):
    args = ["pkey"]
    if not private:
        args.append("-pubin")
    der = openssl(*args, "-in", key, "-pubout", "-outform", "DER")
    # Ed25519 SubjectPublicKeyInfo is a fixed DER prefix + 32 raw key bytes.
    if len(der) != 44 or not der.startswith(bytes.fromhex("302a300506032b6570032100")):
        raise ValueError("Expected an Ed25519 key")
    return der


def key_fingerprint(public_key):
    with tempfile.TemporaryDirectory(prefix="snapvere-key-") as work:
        key = Path(work) / "key.pem"
        key.write_bytes(bounded(public_key, MAX_KEY))
        return hashlib.sha256(public_der(key)).hexdigest()


def sign(patch, private_key, descriptor, signature, expected_fingerprint):
    if not isinstance(expected_fingerprint, str) or not DIGEST.fullmatch(expected_fingerprint):
        raise ValueError("Expected externally pinned key fingerprint")
    d = describe(patch)
    raw = canonical(d)
    if len(raw) > MAX_DESCRIPTOR:
        raise ValueError("Oversized descriptor")
    # The private key remains at its operator-controlled path; do not copy it
    # to the release output. Encrypted keys require an external signing service.
    with tempfile.TemporaryDirectory(prefix="snapvere-sign-") as work:
        work = Path(work)
        if hashlib.sha256(public_der(private_key, private=True)).hexdigest() != expected_fingerprint:
            raise ValueError("Signing key does not match pin")
        message = work / "message"
        message.write_bytes(DOMAIN + raw)
        sig = openssl("pkeyutl", "-sign", "-rawin", "-inkey", private_key, "-in", message)
        if len(sig) != 64:
            raise ValueError("Invalid Ed25519 signature size")
        # Verify the exact signature against the pinned derived public key.
        pub = work / "key.der"
        pub.write_bytes(public_der(private_key, private=True))
        if hashlib.sha256(pub.read_bytes()).hexdigest() != expected_fingerprint:
            raise ValueError("Signing key changed")
        signature_file = work / "signature"
        signature_file.write_bytes(sig)
        openssl("pkeyutl", "-verify", "-rawin", "-pubin", "-keyform", "DER", "-inkey", pub,
                "-in", message, "-sigfile", signature_file)
        # Exclusive outputs. A partially created pair is never accepted by the verifier.
        if Path(descriptor).exists() or Path(signature).exists():
            raise FileExistsError("Refusing to overwrite signing output")
        stage(signature, lambda out: out.write(sig))
        stage(descriptor, lambda out: out.write(raw))
    return d


def verify_and_stage(base, patch, descriptor, signature, public_key, expected_fingerprint,
                     output, target, from_version, to_version):
    if not isinstance(expected_fingerprint, str) or not DIGEST.fullmatch(expected_fingerprint):
        raise ValueError("Expected externally pinned key fingerprint")
    raw = bounded(descriptor, MAX_DESCRIPTOR)
    sig = bounded(signature, 64)
    if len(sig) != 64:
        raise ValueError("Invalid signature size")
    d = validate_descriptor(json.loads(raw))
    if canonical(d) != raw:
        raise ValueError("Noncanonical descriptor")
    h = d["delta"]
    if (h["target"], h["from"], h["to"]) != (target, from_version, to_version):
        raise ValueError("Wrong signed edition, platform or version")
    # Verify a private snapshot of the key, descriptor, signature and delta.
    # No downloaded path is reopened after authentication.
    with tempfile.TemporaryDirectory(prefix="snapvere-verify-") as work:
        work = Path(work)
        key = work / "key.pem"
        key.write_bytes(bounded(public_key, MAX_KEY))
        der = public_der(key)
        if hashlib.sha256(der).hexdigest() != expected_fingerprint:
            raise ValueError("Untrusted update key")
        pinned = work / "key.der"
        pinned.write_bytes(der)
        message = work / "message"
        message.write_bytes(DOMAIN + raw)
        sigfile = work / "signature"
        sigfile.write_bytes(sig)
        openssl("pkeyutl", "-verify", "-rawin", "-pubin", "-keyform", "DER", "-inkey", pinned,
                "-in", message, "-sigfile", sigfile)
        copied = work / "patch"
        with open_source(patch) as source:
            before = os.fstat(source.fileno())
            if before.st_size != d["patch_size"]:
                raise ValueError("Signed patch length mismatch")
            digest = hashlib.sha256()
            remaining = before.st_size
            with copied.open("xb") as out:
                while remaining:
                    chunk = source.read(min(65536, remaining))
                    if not chunk:
                        raise ValueError("Truncated signed patch")
                    out.write(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
                if source.read(1) or fingerprint(before) != fingerprint(os.fstat(source.fileno())):
                    raise ValueError("Signed patch changed")
            if digest.hexdigest() != d["patch_sha256"]:
                raise ValueError("Signed patch digest mismatch")
        if describe(copied) != d:
            raise ValueError("Signed metadata does not match payload")
        return reconstruct(base, copied, output, target, from_version, to_version)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    pin = sub.add_parser("fingerprint")
    pin.add_argument("--public-key", type=Path, required=True)
    signer = sub.add_parser("sign")
    verifier = sub.add_parser("verify-stage")
    for p in (signer, verifier):
        for arg in ("patch", "descriptor", "signature"):
            p.add_argument("--" + arg, type=Path, required=True)
        p.add_argument("--key-fingerprint", required=True)
    signer.add_argument("--private-key", type=Path, required=True)
    for arg in ("base", "public-key", "output"):
        verifier.add_argument("--" + arg, type=Path, required=True)
    for arg in ("target", "from-version", "to-version"):
        verifier.add_argument("--" + arg, required=True)
    a = parser.parse_args()
    if a.action == "fingerprint":
        print(key_fingerprint(a.public_key))
    elif a.action == "sign":
        print(json.dumps(sign(a.patch, a.private_key, a.descriptor, a.signature, a.key_fingerprint), indent=2))
    else:
        print(json.dumps(verify_and_stage(a.base, a.patch, a.descriptor, a.signature, a.public_key,
                                        a.key_fingerprint, a.output, a.target, a.from_version, a.to_version), indent=2))


if __name__ == "__main__":
    main()
