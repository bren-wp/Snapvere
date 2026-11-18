# SNAPVERE v0.2.18 — Windows device and pixel-perfect acceptance protocol

Scope: **Tauri 2/Rust Windows edition** at the GitHub repository. Do not substitute the separately deployed .NET/WinUI website edition.

## Verification levels

- **CI / synthetic:** React in headless Chromium, mocked Tauri IPC, Windows-hosted Rust tests and installer build. Proves only explicitly checked conditions.
- **Virtual Windows UI:** install build on Windows 10 and 11 VMs; capture WebView2 window screenshots and accessibility evidence.
- **Physical acceptance:** repeat on representative real Windows 10 and 11 hardware with actual microphones, speakers, GPU, multiple monitors and varied DPI.
- **Pixel-perfect:** compare screenshots from identical platform/OS/browser rendering, dimensions, font files, zoom, locale, theme, scale and state against *approved* per-screen baseline PNGs. Zero differing RGB pixels is the strict 1:1 measure. Tolerant scores are diagnostics, not proof.

## Required matrix

For each Windows 10 and Windows 11 machine: Windows scaling 100%, 125%, 150% and 200% where available; desktop window at 1120x740 and minimum 880x560; test two-monitor arrangement with different DPI and one monitor with negative virtual coordinates. Record OS version, WebView2 version, GPU/driver, resolution, monitor arrangement and capture SHA.

For each theme (dark default, light) and all 12 languages, inspect and capture:

1. Home: no gallery, populated gallery, searching, filtering, selection, hover, keyboard focus, active, disabled, loading, empty and error.
2. Settings: General, Hotkeys, Capture, Recording, Save, Privacy, About; every toggle, combobox, validation error, translations and dialogs.
3. Region capture overlay: idle, selecting, dragging beyond desktop edges, cancel, multiple monitors and different DPI.
4. Image editor: loading, annotation toolbar, crop, text editing, undo/redo, disabled controls, export and error.
5. Recording HUD: running, paused, finishing, failed Stop/Discard, selected tool, colour palette, blur, cursor/drawing indicators and tooltips.
6. Recording draw overlay and capture frame: transparent/click-through, text editor focus, blur/privacy zones, resize, restart, paused and disabled.
7. Gallery, image preview and video player: empty/populated, pagination, full-screen, pause/seek, corrupt media and inaccessible files.
8. Native dialogs: Save As, microphone permission/error, missing device, overwrite warning, installer EULA and upgrade/uninstall.

Inspect typography (family, font files, weight, size, letter spacing and line heights), alignment, component bounds, radii, icons, gradients, shadows, liquid-glass blur/highlights, contrast, occlusions and interactive transitions. Record source screenshot, reference, heatmap, exact changed pixels and tolerances. **Never silently approve missing baselines.**

## Audio/video physical device acceptance

- Screen: DXGI capture fullscreen/window/region, pause/resume, high frame rate and sleep/wake.
- Audio: mic-only, loopback-only, mic+loopback, device unplug/replug, 5.1 and 7.1 channel downmix including dialogue, timestamp continuity and silence limits.
- Media: playable MP4 with synchronized audio, GIF, interrupted recording, disk-full/permission failure, cancellation and correct gallery recovery.
- Windows packaging: Portable, NSIS and MSI installed and exercised; verify SHA-256 and upgrade/uninstall paths.

## Automated reference measurements

Run on a machine with Python + Pillow installed:

```shell
python -m unittest tools/test_compare_ui_references.py
python tools/compare_ui_references.py --inventory --actual-dir docs/screenshots --report-dir docs/visual-audit
python tools/compare_ui_references.py --actual-dir path/to/native-captures --reference-dir path/to/approved-native-references --report-dir path/to/report
```

The first two commands cover comparison logic and the **synthetic image inventory only**. The third compares user-approved native PNGs; any absent baseline, mismatched dimensions or nonzero exact pixel difference produces a failure. A full Windows acceptance sign-off must separately attach hardware test records and references. No such native sign-off is currently established.

## Evidence to retain

Capture timestamp, build SHA/version, OS/driver/WebView2 versions, display DPI, locale, theme, screen name/state, actual/reference PNG, difference report, reproducible failure log and pass/fail rationale. Mark untested scenarios **UNVERIFIED**, not **PASS**.
