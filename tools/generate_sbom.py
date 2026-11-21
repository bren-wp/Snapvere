#!/usr/bin/env python3
# Snapvere by Brendigo
"""Generate a reproducible CycloneDX inventory from both verified lockfiles.

No registry calls, executable plugins, credentials or external dependencies.
This is an inventory, NOT a claim that packages are vulnerability-free.
"""
import argparse
import base64
import hashlib
import json
import tomllib
import uuid
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
NPM_LOCK = ROOT / "apps/desktop/package-lock.json"
CARGO_LOCK = ROOT / "apps/desktop/src-tauri/Cargo.lock"
APP_MANIFEST = ROOT / "apps/desktop/package.json"


def npm_name(path, entry):
    if entry.get("name"):
        return entry["name"]
    return path.rsplit("node_modules/", 1)[-1]


def npm_integrity_hash(integrity):
    for entry in str(integrity or "").split():
        if "-" not in entry:
            continue
        algo, value = entry.split("-", 1)
        algorithm = {"sha512": "SHA-512", "sha256": "SHA-256", "sha1": "SHA-1"}.get(algo)
        if algorithm:
            try:
                return [{"alg": algorithm, "content": base64.b64decode(value, validate=True).hex()}]
            except ValueError:
                continue
    return []


def components():
    npm = json.loads(NPM_LOCK.read_text(encoding="utf-8"))
    cargo = tomllib.loads(CARGO_LOCK.read_text(encoding="utf-8"))
    seen = {}
    for path, entry in npm["packages"].items():
        if not path or not entry.get("version") or "node_modules/" not in path:
            continue
        name, version = npm_name(path, entry), entry["version"]
        if not name:
            continue
        purl = "pkg:npm/" + quote(name, safe="/") + "@" + quote(version, safe="")
        record = {"type": "library", "bom-ref": purl,
                  "name": name, "version": version, "purl": purl}
        if hashes := npm_integrity_hash(entry.get("integrity")):
            record["hashes"] = hashes
        seen[purl] = record
    for entry in cargo["package"]:
        if entry["name"] == "snapvere" or not entry.get("source"):
            continue
        name, version = entry["name"], entry["version"]
        purl = f"pkg:cargo/{quote(name, safe='')}@{quote(version, safe='')}"
        record = {"type": "library", "bom-ref": purl,
                  "name": name, "version": version, "purl": purl}
        if checksum := entry.get("checksum"):
            record["hashes"] = [{"alg": "SHA-256", "content": checksum.lower()}]
        seen[purl] = record
    return sorted(seen.values(), key=lambda item: item["bom-ref"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    app_version = json.loads(APP_MANIFEST.read_text("utf-8"))["version"]
    fingerprint = hashlib.sha256(NPM_LOCK.read_bytes() + CARGO_LOCK.read_bytes()).hexdigest()
    items = components()
    assert len(items) > 50, f"Unreasonably small dependency inventory: {len(items)}"
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, fingerprint)),
        "version": 1,
        "metadata": {
            "component": {
                "type": "application", "name": "snapvere", "version": app_version
            },
            "properties": [
                {"name": "snapvere:lockfile-sha256", "value": fingerprint},
                {"name": "snapvere:assessment", "value": "dependency-inventory-only-not-a-security-pass"},
            ],
        },
        "components": items,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(sbom, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Wrote CycloneDX 1.6 inventory for {len(items)} locked npm/Cargo packages.")


if __name__ == "__main__":
    main()
