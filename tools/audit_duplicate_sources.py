#!/usr/bin/env python3
# Snapvere by Brendigo
"""Fail on exact duplicate maintained source files, report repeated code blocks.

Dependency trees are intentionally excluded.
Repeated blocks are review candidates, not automatic evidence of dead code.
"""
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = (
    ROOT / "apps/desktop/src",
    ROOT / "apps/desktop/src-tauri/src",
    ROOT / "apps/desktop/src-tauri/native",
    ROOT / "tools",
)
EXTENSIONS = {".rs", ".ts", ".tsx", ".c", ".h", ".mjs", ".py", ".css", ".sh"}
files = sorted({
    path for directory in DIRECTORIES for path in directory.rglob("*")
    if path.is_file() and path.suffix in EXTENSIONS
    and not {"target", "node_modules", "__pycache__"} & set(path.parts)
})
exact = defaultdict(list)
blocks = defaultdict(list)
for path in files:
    relative = str(path.relative_to(ROOT))
    source = path.read_bytes()
    exact[sha256(source).hexdigest()].append(relative)
    # Normalized nontrivial source lines; preserve literals and token spacing.
    # Translation tables contain intentionally repeated strings, not logic.
    if path.name.startswith("i18n"):
        continue
    lines = [
        (number, re.sub(r"\s+", " ", line.strip()))
        for number, line in enumerate(source.decode("utf-8-sig").splitlines(), 1)
        if line.strip() and not line.lstrip().startswith(("//", "#", "/*", "*"))
    ]
    for index in range(len(lines) - 11):
        window = lines[index:index + 12]
        text = "\n".join(line for _, line in window)
        if len(text) < 300:
            continue
        key = sha256(text.encode()).hexdigest()
        blocks[key].append((relative, window[0][0]))

duplicates = [items for items in exact.values() if len(items) > 1]
cross_file = [
    locations for locations in blocks.values()
    if len({file for file, _ in locations}) > 1
]
print(f"Duplicate-source audit: {len(files)} files, {len(duplicates)} identical-file groups")
print(f"Cross-file repeated 12-line windows requiring review: {len(cross_file)}")
for locations in cross_file[:30]:
    print("  " + " | ".join(f"{file}:{line}" for file, line in locations[:5]))
if duplicates:
    for items in duplicates:
        print("  Identical: " + " | ".join(items))
    raise SystemExit("Duplicate source files must be consolidated or explicitly reviewed")
