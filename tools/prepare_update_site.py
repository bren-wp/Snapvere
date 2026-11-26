#!/usr/bin/env python3
# Snapvere by Brendigo
"""Stage update website using the canonical site assets and a published manifest."""
import argparse
import json
import shutil
from pathlib import Path
from generate_update_manifest import PACKAGE_NAMES, SEMVER

def prepare(manifest: Path, out: Path) -> None:
    raw = manifest.read_bytes()
    if len(raw) > 8192:
        raise ValueError("Oversized manifest")
    data = json.loads(raw)
    packages = data.get("packages", [])
    version = data.get("version", "")
    if (data.get("channel") != "stable" or data.get("product") != "snapvere-tauri-windows"
            or not isinstance(version, str) or not SEMVER.fullmatch(version)
            or len(packages) != 10 or {p["name"] for p in packages} != set(PACKAGE_NAMES)):
        raise ValueError("Expected complete stable release catalog")
    if out.exists():
        raise ValueError("Choose a new staging directory; never overwrite the deployed site")
    root = Path(__file__).resolve().parents[1]
    out.mkdir(parents=True)
    for name in ("index.php", "download.php", "catalog.php", "updates.css", ".htaccess"):
        shutil.copyfile(root / "deploy/update.snapvere.com" / name, out / name)
    for name in ("styles.css", "favicon.svg", "fonts/inter-latin.woff2"):
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / "site" / name, target)
    (out / "stable.json").write_bytes(raw)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.manifest, args.out)
