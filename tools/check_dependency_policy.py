#!/usr/bin/env python3
# Snapvere by Brendigo
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
# Verify provenance and integrity metadata across the entire locked graph.
# Bundled WASI dependencies inherit the integrity of their enclosing archive.
packages = npm_lock["packages"]
for path, package in packages.items():
    if not path:
        continue
    if package.get("inBundle"):
        parent_path = path.rsplit("/node_modules/", 1)[0]
        parent = packages.get(parent_path, {})
        assert parent.get("resolved", "").startswith("https://registry.npmjs.org/"), path
        assert re.fullmatch(r"sha512-[A-Za-z0-9+/]+={0,2}", parent.get("integrity", "")), path
        continue
    assert package.get("resolved", "").startswith("https://registry.npmjs.org/"), path
    assert re.fullmatch(r"sha512-[A-Za-z0-9+/]+={0,2}", package.get("integrity", "")), path

for package in cargo_lock["package"]:
    if package["name"] == cargo["package"]["name"] and "source" not in package:
        continue
    assert package.get("source") == "registry+https://github.com/rust-lang/crates.io-index", package["name"]
    assert re.fullmatch(r"[a-f0-9]{64}", package.get("checksum", "")), package["name"]

print(f"Lock provenance checked: {len(packages) - 1} npm entries, {len(cargo_lock['package']) - 1} registry crates")
print("Dependency policy OK: versions synced, bots disabled, audited fork pinned")
