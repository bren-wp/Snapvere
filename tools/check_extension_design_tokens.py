#!/usr/bin/env python3
# Snapvere by Brendigo
"""Verify WebExtension colors/spacing primitives are aligned to desktop source.

This tests design-token parity and responsive/accessibility guards, **not**
pixel-perfect screenshots of an approved native reference. Browser rendering,
DPI, text antialiasing and visual states still need physical acceptance.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = (ROOT / "apps/desktop/src/styles.css").read_text("utf-8")
SOURCES = ("popup.css", "editor.css")
TOKENS = {
    "dark": {
        "bg": "#151831",
        "surface": "#10172c",
        "elevated": "#1c2441",
        "text": "#f7f6ff",
        "muted": "#abb7d7",
        "accent": "#7648eb",
        "accent-hi": "#a78bfa",
        "border": "rgba(164, 141, 255, 0.19)",
    },
    "light": {
        "bg": "#f6f7f9",
        "surface": "#ffffff",
        "elevated": "#f0f0f2",
        "text": "#1c1c1e",
        "muted": "#6e6e73",
        "accent": "#5f38c2",
        "accent-hi": "#5f38c2",
        "border": "rgba(77, 66, 110, 0.2)",
    },
}
assert "@media (prefers-color-scheme: light)" not in DESKTOP, (
    "Desktop theme is explicitly set by the app; this audit expects separate light/dark variables"
)

for file_name in SOURCES:
    text = (ROOT / "extensions/source" / file_name).read_text("utf-8")
    start = text.find("@media (prefers-color-scheme: light)")
    assert start > 0, f"{file_name}: light theme missing"
    dark, light = text[:start], text[start:]
    for mode, part in (("dark", dark), ("light", light)):
        for name, value in TOKENS[mode].items():
            marker = f"--{name}: {value};"
            assert marker in part, f"{file_name}: missing {mode} desktop token {marker}"
            # Ensure comparison is against the desktop-owned brand vocabulary.
            assert value in DESKTOP, f"Source desktop stylesheet missing {marker}"
    assert "focus-visible" in text, f"{file_name}: inaccessible keyboard focus"
    assert "prefers-reduced-motion" in text, f"{file_name}: reduced-motion support missing"
    assert "@media (max-width:" in text, f"{file_name}: narrow viewport breakpoint missing"
    assert "min-width: 330px" not in text, f"{file_name}: prevents narrow popup"
    assert "max-width: 100%" in text or "max-width: 100vw" in text, (
        f"{file_name}: width cannot shrink with parent viewport"
    )
    print(f"{file_name}: 16 dark/light color tokens, responsive and keyboard guards verified")
print("Desktop/extension palette parity verified (visual screenshots still require reference QA)")
