#!/usr/bin/env python3
# Snapvere by Brendigo
"""Fail CI if either edition silently loses native isolation or release assets.

Source-level policy only: not a substitute for executable signature,
filesystem sandbox, Fedora QA, or paid-license/hosted-backend validation.
"""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
read = lambda p: (root / p).read_text(encoding="utf-8")
free = json.loads(read("apps/desktop/src-tauri/tauri.conf.json"))
pro = json.loads(read("apps/desktop/src-tauri/tauri.pro.conf.json"))
assert free["productName"] == "Snapvere" and pro["productName"] == "Snapvere Pro"
assert free["identifier"] == "com.brendigo.snapvere"
assert pro["identifier"] == "com.brendigo.snapvere.pro"
assert free["identifier"] != pro["identifier"]
assert pro["app"]["windows"][0]["title"] == "Snapvere Pro"
cargo = read("apps/desktop/src-tauri/Cargo.toml")
assert re.search(r"(?m)^pro\s*=\s*\[\s*\]", cargo), "Native Pro feature missing"
commands = read("apps/desktop/src-tauri/src/commands.rs")
native = read("apps/desktop/src-tauri/src/commands/pro_batch.rs")
lib = read("apps/desktop/src-tauri/src/lib.rs")
assert '#[cfg(feature = "pro")]\nmod pro_batch;' in commands
assert '#[cfg(not(feature = "pro"))]' in commands
assert 'require_window_label(window.label(), &["home"])?' in commands
assert 'commands::pro_export_batch' in lib
for required in ("blocking_pick_folder()", "persist_noclobber(destination)", "sync_all()",
                 "symlink_metadata", "validate_ids", "MAX_BATCH: usize = 100",
                 "PinnedDirectory::open", "metadata.nlink() != 1",
                 "info.nNumberOfLinks != 1", "tempfile_in(parent)",
                 "OFlags::TMPFILE", "AtFlags::SYMLINK_FOLLOW", "linkat("):
    assert required in native, f"Missing secure Pro batch export guard: {required}"
for forbidden in ("reqwest::", "TcpStream::", "HttpClient::", "std::net::",
                  "ftp::", "WebSocket::"):
    assert forbidden not in native, f"Unexpected network API in Pro local export: {forbidden}"
quality = read(".github/workflows/quality.yml")
release = read(".github/workflows/release.yml")
for name, source in (("quality", quality), ("release", release)):
    assert "VITE_SNAPVERE_EDITION" in source, f"{name}: missing Pro frontend build"
    assert "--features pro --config src-tauri/tauri.pro.conf.json" in source
    assert "cargo test --features pro --locked" in source, f"{name}: no Pro native tests"
    for artifact in (
        "Snapvere-Portable.exe", "Snapvere-Setup.exe", "Snapvere-Setup.msi",
        "Snapvere-Pro-Portable.exe", "Snapvere-Pro-Setup.exe", "Snapvere-Pro-Setup.msi",
        "Snapvere-Linux-amd64.deb", "Snapvere-Linux-x86_64.AppImage",
        "Snapvere-Pro-Linux-amd64.deb", "Snapvere-Pro-Linux-x86_64.AppImage",
    ):
        assert artifact in source, f"{name}: missing {artifact}"
assert "draft: true" in release and "prerelease: true" in release
assert 'gh api --method PATCH "repos/$repo/releases/$releaseId" -F draft=false -F prerelease=true' in release
assert 'repos/$repo/releases?per_page=100' in release, "Draft release must be queried by authorized list"
assert '$verified.tag_name -ne $tag' in release, "Verify identity after publication"
assert "SHA256SUMS.txt" in release and "SHA256SUMS-Linux.txt" in release
assert "Snapvere-update-stable.json" in release
assert "Snapvere-Pro-update-stable.json" not in release, "No unaudited Pro update feed"
# Pro Studio must be an actual separate workflow, not a label-only variant.
pro_profiles = read("apps/desktop/src/lib/proProfiles.ts")
pro_selection = read("apps/desktop/src/lib/proSelection.ts")
pro_frame = read("apps/desktop/src/components/WindowFrame.tsx")
pro_home = read("apps/desktop/src/windows/Home.tsx")
pro_settings = read("apps/desktop/src/windows/Settings.tsx")
for preset in ("tutorial", "presentation", "compact", "webinar", "smooth", "archive", "social", "detailedGif"):
    assert f'"{preset}"' in pro_profiles, f"Missing professional preset: {preset}"
assert "length: 6" in pro_profiles, "Pro must retain six local custom profiles"
for action in ("all", "images", "videos", "recent", "tagged", "invert", "week", "large", "untagged"):
    assert f'"{action}"' in pro_selection, f"Missing Pro smart selection: {action}"
assert "PRO_BATCH_LIMIT = 100" in pro_selection
assert "IS_PRO ? \"snapvere-pro-shell\" : \"\"" in pro_frame, "Pro branding must appear on every main window"
assert 'openSettings("recording")' in pro_home, "Pro recording profiles shortcut must open the real settings tab"
assert 'snapvere:settings-tab' in pro_settings, "Pro settings must honor tab navigation"
assert "selectProBatch" in pro_home, "Pro smart selection must be accessible"
for feature in ("summarizeProSelection", "retainLoadedProSelection", "proExportLock.current"):
    assert feature in pro_home, f"Missing Pro batch workspace safeguard: {feature}"
for required in ("BatchPreset", "MAX_IMAGE_PIXELS", "MAX_IMAGE_BYTES", "transform_exclusively", "SaveAsGuard::acquire", "still_format"):
    assert required in native, f"Missing Pro image export safeguard: {required}"
for preset in ("original", "png", "png1280", "png1920", "png3840", "webp", "webp1280", "webp1920"):
    assert f'"{preset}"' in native and f'value="{preset}"' in pro_home, f"Missing export preset: {preset}"
frontend = read("apps/desktop/src/lib/edition.ts")
assert 'VITE_SNAPVERE_EDITION === "pro"' in frontend
assert "import.meta" in frontend
print("Free/Pro contracts verified: native security, explicit local export, ten packages, draft-first release")
