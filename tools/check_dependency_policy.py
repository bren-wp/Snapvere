#!/usr/bin/env python3
# Snapvere by Brendigo
"""Fail closed if SNAPVERE reintroduces unsafe dependency update practices."""
from pathlib import Path
import json
import tomllib

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "apps/desktop/package.json").read_text("utf-8"))
npm_lock = json.loads((ROOT / "apps/desktop/package-lock.json").read_text("utf-8"))
tauri = json.loads((ROOT / "apps/desktop/src-tauri/tauri.conf.json").read_text("utf-8"))
cargo = tomllib.loads((ROOT / "apps/desktop/src-tauri/Cargo.toml").read_text("utf-8"))
cargo_lock = tomllib.loads((ROOT / "apps/desktop/src-tauri/Cargo.lock").read_text("utf-8"))
versions = (
    manifest["version"], npm_lock["version"], npm_lock["packages"][""]["version"],
    tauri["version"], cargo["package"]["version"],
    next(p["version"] for p in cargo_lock["package"] if p["name"] == "snapvere"),
)
assert len(set(versions)) == 1, f"Application versions disagree: {versions}"

# Dependency updates are now performed manually by the owner; prohibit bots and
# scheduled update workflows, including silent supply-chain write permissions.
assert not (ROOT / ".github/dependabot.yml").exists(), (
    "Dependabot configuration must not be re-enabled"
)
assert not (ROOT / ".github/workflows/dependency-refresh.yml").exists(), (
    "Scheduled dependency updater must not be re-enabled"
)
for path in (ROOT / ".github/workflows").glob("*.yml"):
    content = path.read_text(encoding="utf-8")
    assert "dependabot" not in path.name.lower(), f"Unexpected update bot: {path}"
    assert not path.name.startswith("manual-"), (
        f"One-shot dependency jobs must be deleted after manual verification: {path}"
    )
    assert "cargo update" not in content and "npm update" not in content, (
        f"Unexpected recurring dependency modification workflow: {path}"
    )

assert manifest["overrides"]["picomatch"] == "npm:@ryotsu/picomatch@4.0.7-a", (
    "Do not silently repin audited patched fork"
)
print("Dependency policy OK: versions synced, bots disabled, audited fork pinned")
