#!/usr/bin/env python3
# Snapvere by Brendigo
"""Static WebExtension privacy, permission and remote-script enforcement.

This verifies shipped source and manifests, not the browser vendors themselves
or the behavior of privileged platform APIs at runtime.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extensions/source"
BROWSERS = ("chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari")
PERMISSIONS = {"activeTab", "downloads", "scripting", "clipboardWrite"}

for browser in BROWSERS:
    manifest = json.loads((ROOT / browser / "manifest.json").read_text("utf-8"))
    permissions = set(manifest.get("permissions", []))
    assert manifest["manifest_version"] == 3, f"{browser}: MV3 is required"
    assert {"activeTab", "downloads"} <= permissions
    assert permissions <= PERMISSIONS, f"{browser}: unexpected permission {permissions - PERMISSIONS}"
    for field in ("host_permissions", "optional_host_permissions",
                  "optional_permissions", "content_scripts", "externally_connectable",
                  "oauth2", "update_url"):
        assert not manifest.get(field), f"{browser}: unexpected {field}"
    csp = manifest.get("content_security_policy", {})
    if isinstance(csp, dict):
        for value in csp.values():
            assert "https://" not in value and "unsafe-eval" not in value
    print(f"{browser}: local-only, minimal-permission WebExtension manifest")

# JavaScript identifiers are case-sensitive: "Function(...)" constructs code,
# whereas the common "(function () { ... })()" is harmless syntax. A
# case-insensitive match conflated the two and broke every extension build.
EVAL_PATTERN = r"\b(?:eval|Function)\s*\("
for safe in ("(function () { return 1; })()", "function (value) { return value; }"):
    assert re.search(EVAL_PATTERN, safe) is None, "The code-execution guard must avoid false positives"
for unsafe in ("eval(source)", "Function(source)", "new Function(source)"):
    assert re.search(EVAL_PATTERN, unsafe) is not None, "The code-execution guard must reject execution APIs"

for path in sorted(SOURCE.iterdir()):
    if path.suffix not in {".js", ".html", ".css"}:
        continue
    text = path.read_text("utf-8")
    if path.suffix == ".js":
        # Browser download/data/blob APIs are local. Outbound API calls are not.
        for label, pattern in {
            "outbound network": r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(",
            "telemetry": r"\b(?:sendBeacon|gtag|sentry|analytics)\s*\(",
            "arbitrary JS evaluation": EVAL_PATTERN,
            "remote URL": r"https?://",
            "HTML injection": r"(?:\.innerHTML|document\.write)\s*(?:=|\()",
        }.items():
            # JavaScript is case-sensitive; the evaluation primitive check
            # must not interpret ordinary lowercase function declarations as
            # calls to the uppercase Function constructor.
            flags = 0 if label == "arbitrary JS evaluation" else re.IGNORECASE
            assert re.search(pattern, text, flags) is None, (
                f"{path.name}: forbidden {label}"
            )
    elif path.suffix == ".html":
        assert not re.search(r"<script\b(?![^>]*\bsrc=[\"'][^\"']+\.js[\"'])", text, re.I), (
            f"{path.name}: scripts must be local external files"
        )
        assert not re.search(r"\bon(?:click|load|error|message)\s*=", text, re.I), (
            f"{path.name}: inline event handler forbidden"
        )
    else:
        assert not re.search(r"(?:@import\s+url|url\s*\(\s*[\"']?https?://)", text, re.I), (
            f"{path.name}: stylesheet cannot load third-party assets"
        )

print("WebExtension privacy guard: seven manifests and canonical source verified")
