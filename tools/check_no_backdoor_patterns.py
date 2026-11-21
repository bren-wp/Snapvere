#!/usr/bin/env python3
# Snapvere by Brendigo
"""Source-level defense-in-depth against common outbound/backdoor primitives.

This is an allowlist guard for first-party app code, not a proof that a binary
or its transitive dependencies cannot communicate or execute external code.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "apps/desktop/src-tauri"
DESKTOP = ROOT / "apps/desktop/src"
SITE = ROOT / "site"
MANIFEST = ROOT / "apps/desktop/package.json"

SUSPICIOUS_NATIVE = re.compile(
    r"\b(?:Command::new|CreateProcess(?:A|W)?|ShellExecute(?:A|W)?|"
    r"LoadLibrary(?:A|W)?|WinHttp(?:Open|SendRequest)|InternetOpen(?:A|W)?|"
    r"TcpStream|UdpSocket|reqwest|ureq|hyper::|curl::|libloading::)\b"
)
SUSPICIOUS_WEBVIEW = re.compile(
    r"\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(|"
    r"\bnavigator\.sendBeacon\s*\(|\b(?:importScripts|eval)\s*\("
)
CODE = [*sorted(NATIVE.rglob("*.rs")), *sorted(DESKTOP.rglob("*.ts")),
        *sorted(DESKTOP.rglob("*.tsx"))]
count = 0
for path in CODE:
    if "target" in path.parts or "node_modules" in path.parts:
        continue
    count += 1
    pattern = SUSPICIOUS_NATIVE if path.suffix == ".rs" else SUSPICIOUS_WEBVIEW
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.lstrip().startswith(("//", "*", "/*")):
            continue
        # Raw external endpoints in native code are unusual for an offline
        # capture app; public site analytics is separately reviewed below.
        if path.suffix == ".rs" and re.search(r"https?://", line):
            raise AssertionError(
                f"Native external endpoint requires review: {path}:{number}: {line.strip()}"
            )
        # The reviewed update feed is the only allowed frontend network call.
        official_feed = (
            path == DESKTOP / "lib/updateFeed.ts"
            and line.strip().startswith("const response = await fetch(UPDATE_FEED_URL,")
        )
        if pattern.search(line) and not official_feed:
            raise AssertionError(
                f"Unreviewed network/process primitive: {path}:{number}: {line.strip()}"
            )

manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
dangerous_scripts = {
    "preinstall", "install", "postinstall", "prepare", "prepublish",
    "prepack", "postpack", "prepublishOnly",
} & set(manifest["scripts"])
assert not dangerous_scripts, f"Unreviewed install lifecycle scripts: {dangerous_scripts}"
assert not manifest.get("optionalDependencies"), "Unexpected optional native packages"

analytics = (SITE / "analytics.js").read_text(encoding="utf-8")
assert "https://www.googletagmanager.com/gtag/js" in analytics
assert 'state === "granted"' in analytics
assert 'data-choice="granted"' not in analytics  # consent built via safe DOM nodes
assert "window.snapvereTrack" in analytics
for path in SITE.rglob("*.js"):
    if path.name == "analytics.js":
        continue
    text = path.read_text(encoding="utf-8")
    assert not re.search(r"(?:XMLHttpRequest|navigator\.sendBeacon|WebSocket)\s*\(", text), path

assert count >= 40, f"Native/frontend scan unexpectedly covered only {count} files"
print(f"Source backdoor-pattern guard: {count} native/frontend source files checked")
feed = (DESKTOP / "lib/updateFeed.ts").read_text(encoding="utf-8")
assert 'https://update.snapvere.com/stable.json' in feed
assert 'https://snapvere.com/download/' in feed
assert 'credentials: "omit"' in feed and 'redirect: "error"' in feed
print("No unreviewed process spawning or network calls; only the official read-only update feed is allowed")
print("Site consented Google Analytics is the sole explicitly reviewed third-party script")
