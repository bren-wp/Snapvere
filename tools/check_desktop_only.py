#!/usr/bin/env python3
# Snapvere by Brendigo
"""Prevent retired browser packages from re-entering desktop distribution."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
retired_roots = ("extensions", "chrome", "firefox", "edge", "brave", "opera", "vivaldi", "safari")
for name in retired_roots:
    if (ROOT / name).exists():
        raise SystemExit(f"Retired browser source directory present: {name}")

for workflow in (ROOT / ".github/workflows").glob("*.yml"):
    source = workflow.read_text(encoding="utf-8")
    if re.search(r"build_browser_extensions|check_browser_extensions|check_extension_|audit_browser_extension_graph|test_browser_extension_line_endings|browserZips|browserArchives|extension-package-validation", source):
        raise SystemExit(f"Retired browser build dependency: {workflow.name}")
    if workflow.name == "browser-extensions.yml":
        raise SystemExit("Retired browser workflow still exists")

release = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
match = re.search(r"\$requiredAssets = @\(\s*(.*?)\s*\)", release, re.S)
expected = {
    "Snapvere-Portable.exe", "Snapvere-Setup.exe", "Snapvere-Setup.msi",
    "Snapvere-Pro-Portable.exe", "Snapvere-Pro-Setup.exe", "Snapvere-Pro-Setup.msi",
    "Snapvere-Linux-amd64.deb", "Snapvere-Linux-x86_64.AppImage",
    "Snapvere-Pro-Linux-amd64.deb", "Snapvere-Pro-Linux-x86_64.AppImage",
    "Snapvere-SBOM.cdx.json", "Snapvere-update-stable.json", "SHA256SUMS.txt",
}
names = re.findall(r"'([^']+)'", match.group(1)) if match else []
if len(names) != len(expected) or set(names) != expected:
    raise SystemExit("Desktop release inventory must contain exactly 13 required assets")
print("Desktop-only source scope and 13-asset release inventory verified")
