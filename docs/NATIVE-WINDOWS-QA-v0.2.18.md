# SNAPVERE — native Windows 10/11 UI, security and stability acceptance

This document covers the **Tauri 2 / Rust** Windows application and its **real WebView2 HWNDs**. The public `snapvere.com` WinUI edition and Chromium `device_scale_factor` simulations are **not** substitutes for native results.

## What is verified now

The GitHub Actions Windows runner compiles and tests the app, builds Portable/NSIS/MSI, checks strict Clippy/Rustfmt, audits npm/Cargo, checks the Tauri IPC window permissions and produces a synthetic Playwright preview set. The CI **does not provide a signed, interactive desktop session with representative Win10/11 microphones, DXGI GPUs or displays**. Do not report those checks as actual hardware QA.

## Capture genuine native WebView2 evidence

On a physical Windows 10/11 machine with the application running, activate the desired SNAPVERE window and manually select the theme/state first. Use the local capture script with no admin privileges:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows-native-capture.ps1 -State home -Theme dark
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows-native-capture.ps1 -State settings-capture -Theme light
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows-native-capture.ps1 -State recbar-palette -Theme dark -Hud
```

For exact window-named acceptance captures, manually label `-State` with a corresponding `docs/WINDOWS-VISUAL-QA-v0.2.18.md` state. The collector refuses to overwrite evidence. It stores PNGs and metadata locally under `native-evidence/windows10-dpi-125-dark/` (for example), including OS build, HWND DPI, dimensions, SHA-256 and state label. It never uploads screen content. **Review for confidential material, overlays from other apps, and occlusion before sharing any evidence.**

At each of **100%, 125%, 150%, 200% Windows scaling**, repeat each state on **Windows 10 and Windows 11** in both dark and light themes. Record the actual DPI reported by Windows; if the OS uses another DPI, never label it artificially as one of these four values. Cover at least 1120×740 Home, 880×560 Home minimum, Settings 860×660, Editor 1120×760, HUD compact/expanded, multiple monitors (including negative virtual x), and screen capture area overlays.

## Per-screen state acceptance

- Home, toolbar, gallery: empty/populated, filter tabs, search/results, loading, error, hover, focus, pressed and disabled, media details and delete confirmation.
- Settings: all seven tabs, theme switch synchronized across already-open windows, all 12 locales, picker cancel/accept, autostart, hotkey conflict, validation and disabled GIF audio.
- Editor: annotations, colour, tooltips, crop, undo/redo, Save As cancel/accept, missing/corrupt image and errors.
- Capture overlay: monitor selection, boundary clamp, transparent regions, cancel and DPI scaling, mouse drag handles.
- Recording HUD: compact, palette above toolbar, audio state, pause/resume, Stop failure/retry, Discard, long duration, failed device and completed recording; verify expanded HUD is **not clipped**.
- Drawing overlay and capture frame: click-through/focus, privacy/redaction, multi-monitor positioning and background contrast.
- Gallery/video viewer: real playback, seek, keyboard navigation, empty data and error states.
- Native dialogs and installers: dialog stacking, NSIS/MSI install, upgrade, uninstall, Portable, UAC, license, keyboard focus, screen reader and permissions.

## Strict visual comparison

Use *externally approved original per-screen PNG references* from the **same Windows OS/build, monitor DPI, WebView2 version, viewport, theme, locale and UI state**. Reference PNGs must not be copied from the candidate screenshot directory.

```sh
python tools/compare_ui_references.py --actual-dir "native-evidence/windows11-dpi-125-dark" --reference-dir "approved/windows11-dpi-125-dark" --report-dir "native-reports/windows11-dpi-125-dark"
```

This comparator's current `REQUIRED` set is the minimum existing automated-preview inventory. Native acceptance must additionally complete the state matrix above; an exact RGB match on only the minimum preview set is **not** a full product acceptance certificate.

The `tools/capture_ui.py` synthetic matrix covers **100/125/150/200% emulated devicePixelRatio** for Home and Settings in dark/light; its results explicitly state `native_windows_acceptance: false`.

## Security/dependency acceptance

- Every npm and Cargo version change must carry an updated lockfile, pass `npm audit --audit-level=high`, `cargo audit`, Rust unit tests + strict Clippy, TypeScript tests/build and native installer packaging.
- Approved update PRs are configured for npm, Cargo and GitHub Actions via `.github/dependabot.yml`. No automatic update may bypass reviews, tests or provenance checks. The build-only patched `picomatch` fork is pinned for explicit reassessment rather than being silently replaced.
- The read-only weekly report in `.github/workflows/dependency-refresh.yml` records outdated packages. CI attaches a version-locked CycloneDX SBOM for dependency traceability.
- Validate Tauri IPC caller restrictions, no wildcard store permissions, no network upload of captures, recoverable recordings, safe SQLite gallery persistence and crash recovery.
- Do not declare a release stable or pixel-perfect 1:1 until physical native acceptance and original reference measurements are complete.

## Limitations

No physical Windows machine or approved original reference PNG collection was available in this assistant's session. A successful CI or source-level fix **does not** certify behavior on hardware.
