#!/usr/bin/env python3
# Snapvere by Brendigo
"""Read-only checks for Snapvere public branding and Windows installer terms."""
import json
import re
from urllib.parse import urlparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
APP = ROOT / "apps/desktop"
TAURI = APP / "src-tauri"

config = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))
license_file = config.get("bundle", {}).get("licenseFile")
assert isinstance(license_file, str) and license_file.endswith(".rtf"), (
    "Both NSIS and MSI must include an RTF commercial license"
)
eula = (TAURI / license_file).resolve()
assert eula.is_relative_to(TAURI.resolve()) and eula.is_file()
rtf = eula.read_text(encoding="ascii")
assert rtf.startswith("{\\rtf1") and rtf.rstrip().endswith("}")
source = (ROOT / "legal/SNAPVERE-COMMERCIAL-EULA.txt").read_text(encoding="utf-8")
assert "MIT" in source and "commercial" in source.lower()
for clause in ("COMMERCIAL END-USER LICENSE AGREEMENT", "MIT", "commercial", "Brendigo"):
    assert clause.lower() in rtf.lower(), f"Missing EULA clause: {clause}"

page = (SITE / "license/index.html").read_text(encoding="utf-8")
for clause in ("Commercial license agreement", "Permitted use",
               "Existing MIT and third-party licenses", "Warranties and liability"):
    assert clause.lower() in page.lower(), f"Missing published license clause: {clause}"
assert "/license/" in (SITE / "sitemap.xml").read_text(encoding="utf-8")
for name in ("index.html", "download/index.html", "privacy/index.html"):
    assert 'href="/license/"' in (SITE / name).read_text(encoding="utf-8"), name
settings_source = (APP / "src/windows/Settings.tsx").read_text(encoding="utf-8")
assert "https://snapvere.com/license/" in settings_source
assert "https://brendigo.com" not in settings_source, "External UI links must be Snapvere links"
feed_source = (APP / "src/lib/updateFeed.ts").read_text(encoding="utf-8")
assert "https://update.snapvere.com/stable.json" in feed_source
assert "https://snapvere.com/download/tauri/" in feed_source
assert "https://update.snapvere.com;" in config["app"]["security"]["csp"]

for base, suffixes in ((SITE, {".html", ".js", ".css"}), (APP / "src", {".html", ".ts", ".tsx", ".css"})):
    for file in base.rglob("*"):
        if file.suffix not in suffixes:
            continue
        content = file.read_text(encoding="utf-8").lower()
        for domain in ("github.com", "github.io", "githubusercontent.com"):
            if domain == "github.com" and domain in content and file == SITE / "download/tauri/index.html":
                assert content.count(domain) == 1 and \
                    'href="https://github.com/bren-wp/Snapvere/releases"' in file.read_text("utf-8"), (
                        "Tauri page may link only to official repository releases"
                    )
                continue
            assert domain not in content, (
                f"GitHub references must not appear in the public UI: {file.relative_to(ROOT)}"
            )
# Every hardcoded HTTP(S) endpoint in shipped app source must be first-party.
# 127.0.0.1/asset.localhost/ipc.localhost are development/native media origins,
# not navigable public support/download links.
allowed_app_hosts = {
    "snapvere.com", "update.snapvere.com",
    "127.0.0.1", "asset.localhost", "ipc.localhost",
}
for source_file in (APP / "src").rglob("*"):
    if source_file.suffix not in {".ts", ".tsx", ".html", ".css"}:
        continue
    content = source_file.read_text(encoding="utf-8")
    for endpoint in re.findall(r"""https?://[^\s"\'`<>)]+""", content):
        host = urlparse(endpoint.rstrip("),;")).hostname
        assert host in allowed_app_hosts, (
            f"Nonofficial external URL in shipped UI: {source_file.relative_to(ROOT)}: {endpoint}"
        )

caps = json.loads((TAURI / "capabilities/default.json").read_text(encoding="utf-8"))
runtime = (TAURI / "src/lib.rs").read_text(encoding="utf-8")
for unused, capability in (("tauri_plugin_fs::init()", "fs:default"),
                           ("tauri_plugin_os::init()", "os:default")):
    assert unused not in runtime, f"Unused runtime plugin enabled: {unused}"
    assert capability not in caps["permissions"], f"Excess webview permission: {capability}"

# UI shortcut and image clipboard APIs are handled in native Rust commands.
# Dialog and WebView creation grants are scoped by check_tauri_capabilities.py;
# only Settings can open the capture-folder picker, manage autostart or use opener.
for unexpected in (
    "global-shortcut:default", "autostart:default", "opener:default",
    "clipboard-manager:allow-write-text", "clipboard-manager:allow-write-image",
    "clipboard-manager:allow-read-image",
):
    assert unexpected not in caps["permissions"], f"Overprivileged shared capability: {unexpected}"
privileged = json.loads(
    (TAURI / "capabilities/settings-privileged.json").read_text(encoding="utf-8")
)
assert privileged["windows"] == ["settings"]
assert set(privileged["permissions"]) == {
    "autostart:default", "opener:default", "dialog:allow-open",
    "store:allow-load", "store:allow-get-store", "store:allow-get",
    "store:allow-set", "store:allow-save",
}, "Settings permissions must stay restricted to startup, dialogs and settings persistence"
assert not any(permission.startswith("store:") for permission in caps["permissions"]), (
    "Shared WebViews must not have direct Store access"
)
app_src = (APP / "src")
for source in app_src.rglob("*.tsx"):
    if source.name == "Settings.tsx":
        continue
    value = source.read_text(encoding="utf-8")
    assert '@tauri-apps/plugin-autostart' not in value, source
    assert '@tauri-apps/plugin-opener' not in value, source
for source in app_src.rglob("*"):
    if source.suffix not in {".ts", ".tsx"}:
        continue
    value = source.read_text(encoding="utf-8")
    assert '@tauri-apps/plugin-clipboard-manager' not in value, source
    assert '@tauri-apps/plugin-global-shortcut' not in value, source

print("Public Snapvere: license, installer EULA, least privilege and links OK")
