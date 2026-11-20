#!/usr/bin/env python3
"""Deterministically build browser-specific extension directories and archives."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extensions" / "source"
BROWSERS = ("chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari")
ASSETS = (
    "capture.js", "workspace.js", "background.js",
    "popup.js", "popup.html", "popup.css",
    "editor.js", "editor.html", "editor.css",
)
VERSION = "0.2.1"


def canonical_text_bytes(value: bytes) -> bytes:
    """Normalize only CRLF, never change actual source text or file contents.

    Git for Windows can check out a tracked .json/.js/.css/.html file with
    CRLF even when canonical Git blobs use LF. The checker must compare
    logical source content, while generated ZIP bytes remain LF-only and
    deterministic across operating systems.
    """
    normalized = value.replace(b"\r\n", b"\n")
    if b"\r" in normalized:
        raise AssertionError("Unsupported standalone carriage return in extension source")
    return normalized


def make_manifest(browser: str) -> dict:
    result = {
        "manifest_version": 3,
        "name": "SNAPVERE — " + browser.title(),
        "version": VERSION,
        "description": "Capture visible tabs, crop regions and scroll webpages; annotate PNG privately.",
        "permissions": ["activeTab", "downloads", "scripting", "clipboardWrite"],
        "action": {"default_title": "Capture tab with SNAPVERE", "default_popup": "popup.html"},
        "background": ({"scripts": ["capture.js", "background.js"]}
                       if browser in {"firefox", "safari"} else {"service_worker": "background.js"}),
        "commands": {"capture-visible-tab": {
            "suggested_key": {"default": "Ctrl+Shift+8", "mac": "Command+Shift+8"},
            "description": "Save a screenshot of the visible tab",
        }},
    }
    if browser == "firefox":
        result["browser_specific_settings"] = {
            "gecko": {"id": "capture@snapvere.com", "strict_min_version": "128.0"}
        }
    return result

def expected(browser: str) -> dict[str, bytes]:
    result = {name: canonical_text_bytes((SOURCE / name).read_bytes()) for name in ASSETS}
    result["manifest.json"] = (json.dumps(make_manifest(browser), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return result

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check", action="store_true", help="Fail if generated files differ from canonical source")
    modes.add_argument("--build", action="store_true", help="Regenerate each browser's complete source")
    p.add_argument("--zip-dir", type=Path, help="Optional destination for installable source ZIPs with --build")
    args = p.parse_args()
    if args.zip_dir and not args.build:
        p.error("--zip-dir requires --build")
    for browser in BROWSERS:
        output = ROOT / browser
        bundle = expected(browser)
        if args.check:
            extras = {x.name for x in output.iterdir() if x.is_file()} - set(bundle)
            if extras:
                raise AssertionError(f"Unexpected {browser} files: {sorted(extras)}")
            for name, content in bundle.items():
                target = output / name
                if not target.is_file() or canonical_text_bytes(target.read_bytes()) != content:
                    raise AssertionError(f"Outdated {target.relative_to(ROOT)}; run --build")
        else:
            output.mkdir(parents=True, exist_ok=True)
            for name, content in bundle.items():
                (output / name).write_bytes(content)
            if args.zip_dir:
                args.zip_dir.mkdir(parents=True, exist_ok=True)
                dest = args.zip_dir / f"Snapvere-{browser}-extension-{VERSION}.zip"
                with ZipFile(dest, "w", ZIP_DEFLATED) as archive:
                    for name, payload in sorted(bundle.items()):
                        # A checked-out file's timestamp is not part of its
                        # identity. Fixed ZIP metadata makes two builds from
                        # the same source byte-for-byte reproducible.
                        item = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                        item.compress_type = ZIP_DEFLATED
                        item.external_attr = 0o100644 << 16
                        archive.writestr(item, payload, compress_type=ZIP_DEFLATED, compresslevel=9)
                print(dest)
        print(f"SNAPVERE {browser}: {len(bundle)} bundled files verified" if args.check else
              f"SNAPVERE {browser}: {len(bundle)} bundled files generated")

if __name__ == "__main__":
    main()
