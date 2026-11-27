#!/usr/bin/env python3
# Snapvere by Brendigo
"""Create English, root-level shared-host deployment ZIPs.

Input: GitHub's published latest-release API response (never a draft).
No deployment credentials, keys, user recordings or unpublished manifests are included.
"""
import argparse
import json
import re
import tempfile
import zipfile
from pathlib import Path
from generate_update_manifest import PACKAGE_NAMES, SEMVER
from prepare_update_site import prepare

ROOT = Path(__file__).resolve().parents[1]
EXTRA = {"SHA256SUMS.txt", "Snapvere-SBOM.cdx.json", "Snapvere-update-stable.json"}

def release_catalog(release):
    tag = release.get("tag_name", "")
    if (release.get("draft") is not False or release.get("prerelease") is not False
            or not isinstance(tag, str) or not tag.startswith("v")
            or not SEMVER.fullmatch(tag[1:]) or any(int(p)>999999 for p in tag[1:].split("."))):
        raise ValueError("Expected published stable release")
    assets = release.get("assets", [])
    expected = set(PACKAGE_NAMES) | EXTRA
    if len(assets) != 13 or {a["name"] for a in assets} != expected:
        raise ValueError("Release asset inventory incomplete")
    for a in assets:
        if (a.get("state") != "uploaded" or type(a.get("size")) is not int or a["size"] < 1
                or not re.fullmatch(r"sha256:[0-9a-f]{64}", a.get("digest") or "")
                or a.get("browser_download_url") != f"https://github.com/bren-wp/Snapvere/releases/download/{tag}/{a['name']}"):
            raise ValueError("Missing or unexpected asset metadata")
    packages = [{"name": a["name"], "size": a["size"], "sha256": a["digest"][7:]}
                for a in assets if a["name"] in PACKAGE_NAMES]
    if any(p["size"] < 1000000 for p in packages):
        raise ValueError("Unexpectedly small binary")
    # Full-release inventory is verified above, but none of those binaries
    # are incremental updates. Never advertise a full/portable package here.
    return {"product": "snapvere-installed-delta-v1", "version": tag[1:],
            "notes": "Latest published release. Dedicated updates are not yet published.",
            "channel": "stable", "packages": []}

def archive(path, files):
    if path.exists():
        raise ValueError("Refusing to overwrite an existing deployment archive")
    with zipfile.ZipFile(path, "x", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, source in sorted(files.items()):
            z.write(source, name)
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None:
            raise ValueError("Archive integrity check failed")

def build(release, out):
    catalog = release_catalog(release)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        manifest = tmp / "stable.json"
        manifest.write_text(json.dumps(catalog, indent=2)+"\n", encoding="utf-8")
        update = tmp / "update"
        prepare(manifest, update)
        update_files = {p.relative_to(update).as_posix():p for p in update.rglob("*") if p.is_file()}
        update_files["README.txt"] = ROOT / "deploy/update.snapvere.com/README.txt"
        share = ROOT / "deploy/snpv.re"
        share_files = {n:share/n for n in ("index.php","service.php",".htaccess","README.txt")}
        share_files.update({"viewer.html":ROOT/"snpv.re/index.html",
                            "share.css":ROOT/"snpv.re/share.css",
                            "share.js":ROOT/"snpv.re/share.js",
                            "robots.txt":ROOT/"snpv.re/robots.txt"})
        for n in ("styles.css","favicon.svg","fonts/inter-latin.woff2"):
            share_files[n] = ROOT/"site"/n
        archive(out/"snpv.re-English.zip",share_files)
        archive(out/"update.snapvere.com-English.zip",update_files)
        print(f"Root-ready web packages, published catalog v{catalog['version']}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--release-json", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    build(json.loads(args.release_json.read_text(encoding="utf-8")), args.out)
