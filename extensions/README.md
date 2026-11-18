# SNAPVERE Browser Extensions — v0.1.0 (development)

This directory contains the **canonical source** for independently packaged SNAPVERE WebExtensions. The `chrome/`, `edge/`, `brave/`, `opera/`, `vivaldi/`, `firefox/` and `safari/` folders in the repository root each contain their own complete generated bundle, not links to files outside the extension directory.

## Capabilities

- Capture **visible portion** of the active tab as PNG and save locally under `Downloads/Snapvere/`.
- Toolbar popup with clear status and keyboard shortcut `Ctrl+Shift+8` (Mac `Command+Shift+8`, subject to browser/OS availability).
- No account, remote endpoint, clipboard, content scripts, all-sites host permission, cookie access or telemetry. The **only link** in the popup goes to `https://snapvere.com/`.
- These are **standalone browser tab capture add-ons**, not yet paired via Native Messaging with the Windows desktop program. They **cannot** intercept global Print Screen when the browser is closed; the desktop app has its own Windows global shortcut.
- Browser-dependent limitations: restricted internal pages, private/incognito windows, screenshot API limitations and download policies may block capture.

## Development and reproducible build

```bash
python tools/build_browser_extensions.py --check
python tools/build_browser_extensions.py --build --zip-dir browser-extension-dist
node --test extensions/tests/*.test.mjs
```

To test the Chromium editions, enable Developer Mode in the extensions page and **Load unpacked** for the browser's own folder. For Firefox, use `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `firefox/manifest.json` (signed AMO XPI needed for normal distribution). Do not publish store listings without the browser's actual store review.

**Safari** uses WebExtension source in `safari/`, but distributing it requires Apple's Safari Web Extension packaging workflow (Xcode or the Safari Web Extension Packager and Apple distribution signing). A standalone copied folder is **not** an installable production Safari extension. On macOS, validate and package this source as a separate Safari target before submission. No macOS/iOS Safari runtime test has been performed.

Current stage: functional **development MVP**, not 1:1 design approval, release-store acceptance, native-device test or complete full-page capture. Future features should be developed individually: full-scroll capture with explicit permission design, region crop, annotation, integration with native Windows SNAPVERE, cross-browser settings and store signing.
