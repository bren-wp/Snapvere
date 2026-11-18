#!/usr/bin/env python3
"""Fail closed if SNAPVERE reintroduces unsafe dependency update practices."""
from pathlib import Path
import json
import re
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

config = (ROOT / ".github/dependabot.yml").read_text("utf-8")
assert config.startswith("version: 2"), "Dependabot file missing/unsupported"
for ecosystem in ('"npm"', '"cargo"', '"github-actions"'):
    assert f"package-ecosystem: {ecosystem}" in config, f"Missing {ecosystem} updates"
assert config.count('interval: "weekly"') == 3
assert "open-pull-requests-limit:" in config
assert 'dependency-name: "picomatch"' in config, "Patched fork needs manual review"
assert "target-branch:" not in config, "Do not accidentally bypass default-branch security PRs"

refresh = (ROOT / ".github/workflows/dependency-refresh.yml").read_text("utf-8")
assert re.search(r"(?m)^permissions:\s*\n\s+contents: read\s*$", refresh), (
    "Dependency freshness workflow must be read-only"
)
assert not re.search(r"(?m)^\s+contents:\s*write\s*$", refresh)
for forbidden in ("gh auth setup-git", "git push ", "npm install --save", "npm install --save-dev"):
    assert forbidden not in refresh, f"Unsafe dependency workflow mutation: {forbidden}"
assert "npm ci --ignore-scripts" in refresh
assert "npm audit --audit-level=high" in refresh
assert "cargo audit --file" in refresh
assert "npm outdated --json" in refresh and "cargo outdated --format json" in refresh
assert "actions/upload-artifact@" in refresh, "Read-only freshness reports not retained"

assert manifest["overrides"]["picomatch"] == "npm:@ryotsu/picomatch@4.0.7-a", (
    "Do not silently repin audited patched fork"
)
print("Dependency policy OK: versions synced, reviewed update PRs, read-only scanner and patched fork protected")
