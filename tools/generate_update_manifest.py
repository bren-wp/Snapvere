#!/usr/bin/env python3
# Snapvere by Brendigo
"""Generate the informational release catalog for the official update server.

With --packages-dir, include all ten exact package sizes and SHA-256 digests.
Without packages, generate a legacy version-only rehearsal notice.
Neither form is a signed updater payload or proof of deployment.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

PRODUCT = "snapvere-tauri-windows"
DOWNLOAD_URL = "https://snapvere.com/download/tauri/"
SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")


PACKAGE_NAMES = tuple(
    prefix + suffix
    for prefix in ("Snapvere", "Snapvere-Pro")
    for suffix in ("-Setup.exe", "-Setup.msi", "-Portable.exe",
                   "-Linux-amd64.deb", "-Linux-x86_64.AppImage")
)


def write_manifest(version: str, target: Path, packages_dir: Path | None = None) -> None:
    match = SEMVER.fullmatch(version)
    if not match or any(int(part) > 999999 for part in match.groups()):
        raise ValueError("Windows version must be a valid numeric major.minor.patch")
    data = {
        "product": PRODUCT,
        "version": version,
        "download_url": DOWNLOAD_URL,
        "notes": "Windows stability, safe browser PNG export and offline capture improvements.",
    }
    if packages_dir is not None:
        packages = []
        for name in PACKAGE_NAMES:
            path = packages_dir / name
            if path.is_symlink() or not path.is_file() or path.stat().st_size < 1000000:
                raise ValueError(f"Missing or invalid package: {name}")
            with path.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
            packages.append({"name": name, "size": path.stat().st_size, "sha256": digest})
        data.update(channel="stable", packages=packages)
    encoded = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(encoded) > 8192:
        raise ValueError("Version-only manifest exceeds desktop safety bound")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encoded)
    print(f"Informational update manifest generated: {target} ({len(encoded)} bytes)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--packages-dir", type=Path)
    args = ap.parse_args()
    write_manifest(args.version, args.out, args.packages_dir)
