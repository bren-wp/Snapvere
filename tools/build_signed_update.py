#!/usr/bin/env python3
# Snapvere by Brendigo
"""Build a signed differential-only offline package; not a production publisher.

Inputs are owner-verified exact base and target binaries/packages, not portable
downloads. The native runner must already contain the independent signing pin.
The Windows executable is NOT Authenticode signed by this tool.
"""
import argparse
import hashlib
from pathlib import Path
import struct
import tempfile

from delta_patch import build, open_source, stage, MAX_BYTES
from signed_delta import sign, public_der, key_fingerprint, bounded

NAMES = {
    "windows-free": "Snapvere-Update.exe",
    "windows-pro": "Snapvere-Pro-Update.exe",
    "linux-free": "Snapvere-Linux-Update.svpatch",
    "linux-pro": "Snapvere-Pro-Linux-Update.svpatch",
}


def copy_stream(path, out):
    with open_source(path) as source:
        while chunk := source.read(65536):
            out.write(chunk)


def package(base, new, out, target, old, version, private, public, pin, runner=None):
    if target not in NAMES or out.name != NAMES[target] or out.exists():
        raise ValueError("Unexpected update output name or existing file")
    if target.startswith("windows") != (runner is not None):
        raise ValueError("Windows requires its native runner; Linux requires only the delta file")
    if key_fingerprint(public) != pin:
        raise ValueError("Public key does not match independently supplied pin")
    with tempfile.TemporaryDirectory() as work:
        root = Path(work)
        delta, descriptor, signature = [root / n for n in ("delta", "descriptor", "signature")]
        info = build(base, new, delta, target, old, version)
        signed = sign(delta, private, descriptor, signature, pin)
        raw = bounded(descriptor, 8192)
        sig = bounded(signature, 64)
        der = public_der(public)
        if len(sig) != 64 or len(der) != 44 or hashlib.sha256(der).hexdigest() != pin:
            raise ValueError("Unexpected signature or key")
        prefix = b"SVUPKG01" + struct.pack(">I", len(raw)) + raw + sig + der
        size = len(prefix) + signed["patch_size"]
        if runner is not None:
            with open_source(runner) as stream:
                if stream.read(2) != b"MZ":
                    raise ValueError("Expected Windows PE runner")
            size += runner.stat().st_size + 16
        if size >= info["new_bytes"] or size > MAX_BYTES:
            raise ValueError("Not smaller than target; no full-package fallback")
        def write(dest):
            if runner is not None:
                copy_stream(runner, dest)
            dest.write(prefix)
            copy_stream(delta, dest)
            if runner is not None:
                dest.write(b"SVUPEND1" + struct.pack(">Q", len(prefix) + signed["patch_size"]))
            if dest.tell() != size:
                raise ValueError("Unexpected output size")
        stage(out, write)
    return {"name":out.name,"target":target,"from":old,"to":version,"size":size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base","new","out","private","public"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--runner", type=Path)
    parser.add_argument("--target", choices=NAMES, required=True)
    for name in ("old","version","pin"):
        parser.add_argument("--"+name, required=True)
    args = parser.parse_args()
    print(package(**vars(args)))
