#!/usr/bin/env python3
"""Enforce the explicit per-window Tauri plugin permission boundary."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "apps/desktop/src-tauri/capabilities"

def read(name):
    data = json.loads((root / name).read_text(encoding="utf-8"))
    assert len(data["permissions"]) == len(set(data["permissions"])), name
    return data

shared = read("default.json")
home = read("home-privileged.json")
settings = read("settings-privileged.json")

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
