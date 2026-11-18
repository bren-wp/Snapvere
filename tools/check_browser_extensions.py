#!/usr/bin/env python3
"""Fail-closed least-privilege and URL checks for each browser's WebExtension."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSERS = ("chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari")
for browser in BROWSERS:
    directory = ROOT / browser
    manifest = json.loads((directory / "manifest.json").read_text("utf-8"))
    assert manifest["manifest_version"] == 3
    assert manifest["version"] == "0.1.0"
    assert set(manifest["permissions"]) == {"activeTab", "downloads"}
    for forbidden in ("host_permissions", "content_scripts", "web_accessible_resources",
                      "optional_permissions", "externally_connectable", "oauth2", "update_url"):
        assert forbidden not in manifest, f"{browser}: unexpected privilege {forbidden}"
    if browser in ("firefox", "safari"):
        assert manifest["background"]["scripts"] == ["capture.js", "background.js"]
    else:
        assert manifest["background"] == {"service_worker": "background.js"}
    assert manifest["commands"]["capture-visible-tab"]["suggested_key"]["default"] == "Ctrl+Shift+8"
    assert "github" not in (directory / "popup.html").read_text("utf-8").lower()
    assert 'href="https://snapvere.com/"' in (directory / "popup.html").read_text("utf-8")
    for name in ("capture.js", "background.js", "popup.js"):
        source = (directory / name).read_text("utf-8")
        for disallowed in ("fetch(", "XMLHttpRequest", "WebSocket(", "eval(", "new Function(",
                           "document.cookie", "chrome.storage", "browser.storage", "nativeMessaging",
                           "getAllFrames", "executeScript", "scripting.executeScript"):
            assert disallowed not in source, f"{browser}/{name}: forbidden {disallowed}"
    capture = (directory / "capture.js").read_text("utf-8")
    assert "captureVisibleTab" in capture and 'format: "png"' in capture
    assert '"Snapvere/Snapvere-"' in capture
    print(f"{browser}: Manifest V3 least privilege, no remote code, no telemetry")
print("Seven independent SNAPVERE browser extension packages passed static guards")
