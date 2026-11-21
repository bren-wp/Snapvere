#!/usr/bin/env python3
# Snapvere by Brendigo
"""Enforce branded headers on maintained desktop, website and QA source files.

Generated browser-extension variants, machine-readable manifests, assets and
third-party dependencies are validated separately and must not be altered by
a generic header insertion.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    (ROOT / "apps/desktop/src-tauri", {".rs"}),
    (ROOT / "apps/desktop/src", {".ts", ".tsx", ".css"}),
    (ROOT / "apps/desktop/tests", {".mjs"}),
    (ROOT / "site", {".js", ".css"}),
    (ROOT / "tools", {".py", ".mjs", ".ps1"}),
]
missing = []
checked = 0

for directory, extensions in TARGETS:
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.suffix not in extensions:
            continue
        if directory.name == "site" and path.parent != directory:
            continue
        content = path.read_text(encoding="utf-8-sig")
        first = content[:250].casefold()
        checked += 1
        if "snapvere by brendigo" not in first:
            missing.append(str(path.relative_to(ROOT)))

if missing:
    raise SystemExit(
        "Snapvere branding header missing from maintained source files:\n"
        + "\n".join(missing)
    )

print(f"Snapvere by Brendigo source headers verified: {checked} files")
