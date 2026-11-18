#!/usr/bin/env python3
"""Security gate for seven bundled SNAPVERE WebExtensions.

The scripting capability is limited to activeTab temporary grants, with no
host-wide permissions. Clipboard WRITE requires a user action in the editor.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSERS = ("chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari")
ASSETS = (
    "capture.js", "workspace.js", "background.js",
    "popup.js", "popup.html", "popup.css",
    "editor.js", "editor.html", "editor.css",
)
for browser in BROWSERS:
    directory = ROOT / browser
    manifest = json.loads((directory / "manifest.json").read_text("utf-8"))
    assert manifest["manifest_version"] == 3
    assert manifest["version"] == "0.2.0"
    assert set(manifest["permissions"]) == {
        "activeTab", "downloads", "scripting", "clipboardWrite"
    }
    for forbidden in ("host_permissions", "content_scripts", "web_accessible_resources",
                      "optional_permissions", "externally_connectable", "oauth2", "update_url",
                      "content_security_policy"):
        assert forbidden not in manifest, f"{browser}: forbidden privilege {forbidden}"
    if browser in ("firefox", "safari"):
        assert manifest["background"]["scripts"] == ["capture.js", "background.js"]
    else:
        assert manifest["background"] == {"service_worker": "background.js"}
    assert manifest["commands"]["capture-visible-tab"]["suggested_key"]["default"] == "Ctrl+Shift+8"
    files = {path.name for path in directory.iterdir() if path.is_file()}
    assert files == set(ASSETS) | {"manifest.json"}, f"{browser}: unexpected bundled files: {files}"
    for name in ASSETS:
        source = (directory / name).read_text("utf-8")
        assert "github.com" not in source.lower() and "github.io" not in source.lower()
        assert not re.search(r"https?://(?!snapvere\.com(?:[/\"']|$))", source), (
            f"{browser}/{name}: external URL outside official snapvere.com"
        )
        for forbidden in ("XMLHttpRequest", "WebSocket(", "eval(", "new Function(",
                          "document.cookie", "chrome.storage", "browser.storage",
                          "sendNativeMessage(", "connectNative(", "getAllFrames", "externally_connectable",
                          "tabs.update(", "debugger.attach", "getUserMedia("):
            assert forbidden not in source, f"{browser}/{name}: forbidden {forbidden}"
        if name != "workspace.js":
            assert "scripting.executeScript" not in source, (
                f"{browser}/{name}: injection must be isolated in workspace"
            )
    workspace = (directory / "workspace.js").read_text("utf-8")
    assert "api.scripting.executeScript" in workspace
    assert 'target: { tabId }' in workspace
    assert 'active: true, currentWindow: true' in workspace
    assert 'MAX_PIXELS = 28_000_000' in workspace
    assert 'FRAME_DELAY_MS = 650' in workspace
    assert 'finally {' in workspace and "restoreDocument" in workspace
    assert 'indexedDB.open(DB_NAME' in workspace
    assert "fetch(" not in workspace
    editor = (directory / "editor.js").read_text("utf-8")
    assert "navigator.clipboard.write" in editor
    assert "ClipboardItem" in editor
    assert "downloads.download" in editor
    assert "readText" not in editor and "clipboard.read" not in editor
    assert 'href="https://snapvere.com/"' in (directory / "popup.html").read_text("utf-8")
    assert 'href="https://snapvere.com/"' in (directory / "editor.html").read_text("utf-8")
    print(f"{browser}: least privilege, local capture/editor, official links, no network or telemetry")

print("All seven independent SNAPVERE browser extensions passed static security rules")
