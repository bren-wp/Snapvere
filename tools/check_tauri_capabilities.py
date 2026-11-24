#!/usr/bin/env python3
# Snapvere by Brendigo
"""Enforce the explicit per-window Tauri plugin permission boundary."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "apps/desktop/src-tauri/capabilities"

def read(name):
    data = json.loads((root / name).read_text(encoding="utf-8"))
    assert len(data["permissions"]) == len(set(data["permissions"])), name
    return data

shared = read("default.json")
home = read("home-privileged.json")
settings = read("settings-privileged.json")
preview = read("recording-preview.json")
assert preview["windows"] == ["recpreview"], "Recording preview permission scope changed"
assert set(preview["permissions"]) == {"core:default", "core:event:default"}, (
    "Recording preview received additional capabilities"
)

expected = {"home", "overlay", "editor", "settings", "recbar", "recdraw", "recframe", "overlay-*"}
assert set(shared["windows"]) == expected, "Shared window set changed; review new WebView security"
assert not any(p.startswith("store:") for p in shared["permissions"]), "Shared WebViews may alter global settings"
capture = read("capture-readonly.json")
assert set(capture["windows"]) == {"home", "overlay", "overlay-*", "editor"}
assert not capture["permissions"], "Capture windows must not get store write permissions"
assert home["windows"] == ["home"], "Home capability leaked into another window"
assert settings["windows"] == ["settings"], "Settings capability leaked into another window"

elevated = {
    "core:webview:allow-create-webview-window",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-ask",
    "opener:default",
    "autostart:default",
    "global-shortcut:default",
    "clipboard-manager:default",
}
assert not (set(shared["permissions"]) & elevated), "Privileged plugin grant found on all WebViews"
assert set(home["permissions"]) == {
    "core:webview:allow-create-webview-window",
    "dialog:allow-ask",
}, "Home permissions expanded without review"
assert set(settings["permissions"]) == {
    "autostart:default", "opener:default", "dialog:allow-open",
    "store:allow-load", "store:allow-get-store", "store:allow-get",
    "store:allow-set", "store:allow-save"
}, "Settings permissions expanded without review"

for name in ("home-privileged.json", "settings-privileged.json"):
    assert "*" not in "".join(read(name)["windows"]), f"Wildcard privileged capability: {name}"

print("Tauri capability boundary OK: unprivileged capture, Settings-only store writes, Home-only dialogs")

# Plugin grants do not restrict application-defined commands. Those need
# explicit Rust-side caller checks, especially for frozen screens and gallery.
commands = (root.parent / "src" / "commands.rs").read_text(encoding="utf-8")
protected_ipc = {
    "reveal_overlay": ["overlay"],
    "get_frozen_frame": ["overlay"],
    "get_frozen_rgba": ["overlay"],
    "finish_region_capture": ["overlay"],
    "cancel_capture": ["overlay"],
    "start_recording": ["overlay"],
    "stop_recording": ["recbar"],
    "cancel_recording": ["recbar"],
    "pause_recording": ["recbar", "recdraw"],
    "recording_status": ["recbar", "recdraw"],
    "get_crop_preview": ["recpreview"],
    "get_crop_preview_packet": ["recpreview"],
    "resume_crop_preview": ["recpreview"],
    "rec_frame_rect": ["recframe"],
    "set_draw_interactive": ["recdraw"],
    "set_blur_regions": ["recdraw"],
    "close_rec_hud": ["recbar"],
    "set_rec_hud_expanded": ["recbar"],
    "begin_region_capture": ["home"],
    "capture_fullscreen": ["home"],
    "import_clipboard_image": ["home"],
    "save_edited_image": ["overlay", "editor"],
    "list_screenshots": ["home"],
    "search_screenshots": ["home"],
    "delete_screenshot": ["home"],
    "add_tag": ["home"],
    "open_media": ["home"],
    "reveal_media": ["home"],
    "copy_media_path": ["home"],
    "copy_media_image": ["home"],
    "log_file_path": ["settings"],
    "open_capture_folder": ["home", "settings"],
    "open_data_folder": ["settings"],
}
for name, allowed in protected_ipc.items():
    match = re.search(
        rf"#\[tauri::command\]\s+pub\s+(?:async\s+)?fn\s+{name}\s*\(",
        commands,
    )
    assert match is not None, f"Missing protected IPC function: {name}"
    body = commands.index("{", match.end())
    signature = commands[match.end():body]
    assert "window: tauri::WebviewWindow" in signature, f"Missing caller identity in {name}"
    first_statements = commands[body + 1:body + 300]
    guard = re.search(
        r'require_window_label\(window\.label\(\),\s*&\[([^\]]+)\]\)\?;',
        first_statements,
    )
    assert guard is not None, f"Unprotected IPC function: {name}"
    actual = re.findall(r'"([^"]+)"', guard.group(1))
    assert actual == allowed, f"Incorrect origin permissions for {name}: {actual}"
    if name == "pause_recording":
        assert re.search(
            r'if paused\s*\{\s*require_window_label\(window\.label\(\), &\["recbar", "recdraw"\]\)\?;\s*\}\s*else\s*\{\s*require_window_label\(window\.label\(\), &\["recbar"\]\)\?;',
            first_statements,
        ), "Only recbar may resume through the generic pause command"

print(f"Rust IPC origin boundary OK: {len(protected_ipc)} sensitive commands")
