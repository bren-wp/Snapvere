#!/usr/bin/env python3
"""Generate a *version-only* manifest to be uploaded manually to the official server.

This file is NOT a signed Tauri updater payload, remote executable URL or
proof that update.snapvere.com has already been deployed.
"""
import argparse
import json
import re
from pathlib import Path

PRODUCT = "snapvere-tauri-windows"
DOWNLOAD_URL = "https://snapvere.com/download/"
SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")


def write_manifest(version: str, target: Path) -> None:
    match = SEMVER.fullmatch(version)
    if not match or any(int(part) > 999999 for part in match.groups()):
        raise ValueError("Windows version must be a valid numeric major.minor.patch")
    data = {
        "product": PRODUCT,
        "version": version,
        "download_url": DOWNLOAD_URL,
        "notes": "Windows stability, safe browser PNG export and offline capture improvements.",
    }
    encoded = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(encoded) > 8192:
        raise ValueError("Version-only manifest exceeds desktop safety bound")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encoded)
    print(f"Unsigned version notice manifest generated: {target} ({len(encoded)} bytes)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    write_manifest(args.version, args.out)
