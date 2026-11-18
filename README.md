<div align="center">

<img src="site/icon.png" alt="SNAPVERE application icon" width="104" />

# SNAPVERE

### Capture what matters. Make it clear. Keep it yours.

**Screenshot, annotate and record — without letting your tools get in the way.**

A focused Windows capture workspace from **[BRENDIGO](https://brendigo.com)**.

[![Product](https://img.shields.io/badge/Product-SNAPVERE-7648eb?style=flat-square)](https://snapvere.com)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-141416?style=flat-square)](https://snapvere.com/download/)
[![Privacy](https://img.shields.io/badge/Storage-Local--first-141416?style=flat-square)](https://snapvere.com/privacy/)
[![Release](https://img.shields.io/github/v/release/bren-wp/Snapvere?style=flat-square)](https://github.com/bren-wp/Snapvere/releases)

[**🌐 Public SNAPVERE website (.NET edition)**](https://snapvere.com/) · [**⬇️ Tauri / Rust Windows releases**](https://github.com/bren-wp/Snapvere/releases) · [**🔐 Website privacy**](https://snapvere.com/privacy/)

<img src="site/og.png" alt="Original SNAPVERE branded product artwork" width="860" />

</div>

---

> **Distribution notice:** This repository builds the **Tauri 2 / Rust** Windows
> edition of SNAPVERE. The latest published GitHub release is **v0.2.17**;
> **v0.2.18** is a development candidate pending CI and hardware QA. The
> published v0.2.17 is flagged stable on GitHub but lacks documented physical
> Windows acceptance; it must be treated as a preview.
> The publicly deployed snapvere.com product distributes a separate .NET / WinUI 3
> edition. Their installers, versions, licenses and update paths are not interchangeable.
> The production website, email download flow, and its binaries are not modified
> by this GitHub release.
>
> **Commercial installer agreement:** Windows NSIS/MSI setup packages include the
> [Brendigo commercial end-user license](https://snapvere.com/license/), which is
> presented for acceptance before installation. Business use does not require an
> activation key. Existing MIT-licensed source and third-party license grants
> remain valid. The separate public WinUI distribution has its own release path.

## Languages · 12 available

Snapvere starts in **English**. Select a language in **Settings → General → Language**:
English, Hrvatski, Deutsch, Español, Français, Italiano, Português,
Nederlands, Polski, Čeština, Slovenčina or Slovenščina.

The selection is stored in the on-device Settings file through a strict,
window-scoped Rust command and broadcast to all open desktop windows. The
**225-key application interface catalog** covers capture, settings, editor,
recording HUD, media viewer, privacy, licensing, errors and accessibility
labels in all 12 languages. The **native Windows tray menu** also follows the
selected language, including live updates without restarting. English remains
the source language and fallback for any future untranslated key.

Automated tests reject missing or duplicated keys, missing translations,
hard-coded visible labels and unexpected English strings in scanned React
components. Real Windows 10/11 layout, spoken accessibility, native driver
error messaging, third-party system dialogs and installer localization remain
subject to device-specific QA; automated checks alone are not a guarantee of
perfect translation or pixel-level visual equivalence.

See [localization and QA guidance](docs/LOCALIZATION.md) for the catalog
structure, supported language codes, native tray mapping and test commands.

## v0.2.18 — COM lifecycle and release QA (development candidate)

- Correct COM initialization reference handling for MP4 startup and cleanup after
  a Media Foundation startup failure. Reject unexpected COM HRESULT errors.
- Test S_OK, S_FALSE, RPC_E_CHANGED_MODE and E_FAIL in Windows CI.
- Correct light-mode borders, header/toolbar backgrounds, primary-action text contrast
  and RGB alpha effects; propagate theme changes to already-open application windows.
- Capture React dark/light, hover, focus, disabled, palette and error states in CI,
  with strict reference comparison and no invented native 1:1 acceptance.
- Fix clipped recording HUD palette/error popovers by expanding its native WebView2
  window only while needed, while retaining its 58px control bar and mixed-DPI centering.
- Enforce the GitHub prerelease flag until real Windows 10/11 acceptance is complete.
- GitHub withdrew the picomatch advisory on 18 November 2026, but no patched
  upstream release exists; retain the reviewed pinned build-only fork and tests.
- Update Tauri API/CLI and Lucide to tested compatible npm patches and keep
  the actual lockfile synchronized; update compatible Cargo crates only after
  real Windows Rust/Clippy/RustSec checks pass.
- Add reviewed weekly Dependabot update PRs and read-only dependency freshness reports;
  publish lockfile-derived CycloneDX SBOM and its SHA-256 alongside installers.
- Fix giant screenshot cropping in the viewer's `Fit to window` operation, with
  image-scale regression tests for images bigger than 10,000 pixels.
- Extend automated browser previews to 100/125/150/200% simulated DPI (dark/light);
  add `tools/windows-native-capture.ps1` for locally collected genuine WebView2
  evidence on physical Windows 10/11.
- See [security and dependency audit](docs/SECURITY-STABILITY-v0.2.18.md),
  [native acceptance guide](docs/NATIVE-WINDOWS-QA-v0.2.18.md) and
  [technical COM audit](docs/AUDIT-v0.2.18-P1-com-release.md).

## v0.2.17 — bounded audio and multichannel support (published 17 November 2026)

- Bound WASAPI packets and MP4 audio backlog; safely decode misaligned PCM samples.
- Preserve 5.1/7.1 center dialogue and surround channels in stereo downmix.
- CI passed; physical Windows and 1:1 visual verification remain pending.
- See [technical audit](docs/AUDIT-v0.2.17-P1-audio-memory.md).

## In v0.2.16 — recording and audio-device integrity

- Microphone and system-loopback capture now surface device/API errors that occur
  *after* initial readiness instead of silently producing audio-less recordings.
- A failed selected audio source stops the recording through the existing
  error-handling and MP4 cleanup path.
- Published as [v0.2.16](https://github.com/bren-wp/Snapvere/releases/tag/v0.2.16);
  physical Windows testing and pixel-perfect reference acceptance remain pending.

## v0.2.14 — P1 deletion recovery (implemented)

- Deletes now use a durable SQLite intent and same-volume media staging. Interrupted
  operations restore original captures or finish cleanup safely on the next start.
- Frozen-frame PNG/RGBA transport and overlay lifecycle IPC verify the calling
  WebView window before accessing private screen content.
- Regression scenarios cover transaction failure, interruption before/after commit
  and unsafe filesystem entries; CI and real Windows device tests must still pass.
- This GitHub edition remains separate from the .NET/WinUI installers on
  snapvere.com. See [P1 audit report](docs/AUDIT-v0.2.14-P1-integrity-ipc.md).

## v0.2.13 development quality improvements

- Recording toolbar **Stop** and **Discard** are retryable if a native command fails;
  the toolbar remains visible and offers a clear message instead of silently hiding.
- The media gallery and recording toolbar now use localized accessible action names
  in all 12 supported languages. File sizes and gallery dates use the chosen
  language's number and date conventions.
- Pure unit tests cover retry locks, corrupt metadata and translation completeness.
  Automated browser preview tests inject a failed Stop command to ensure the
  controls remain usable. Real Windows capture, audio and 1:1 visual QA are still
  pending before a stable release.

## Your screen. Your story. One streamlined workflow.

Capture the exact moment that matters. Add an arrow, label a detail, redact a private field, and save a result you can find again. Whether you are reporting a bug, showing a client a design, building a tutorial or documenting a process, SNAPVERE keeps the work simple.

<table>
<tr><td align="center" width="25%">📸<br/><b>Capture precisely</b><br/><sub>Choose a region or your full display</sub></td><td align="center" width="25%">✏️<br/><b>Explain visually</b><br/><sub>Draw, annotate, highlight or blur</sub></td><td align="center" width="25%">🎬<br/><b>Record the flow</b><br/><sub>MP4/GIF, cursor and optional audio</sub></td><td align="center" width="25%">🗂️<br/><b>Find it later</b><br/><sub>Search your local capture library</sub></td></tr>
</table>

### A genuine look inside SNAPVERE

The screenshots below come from **actual rendered React application screens in this repository**, captured automatically by Playwright. They are not AI mockups, and no fictitious user data, videos or recorded outcomes have been added.

<table>
<tr>
  <td width="50%"><img src="docs/screenshots/home.png" alt="Actual SNAPVERE gallery showing screenshot and recording controls" /></td>
  <td width="50%"><img src="docs/screenshots/editor.png" alt="Actual SNAPVERE annotation editor interface" /></td>
</tr>
<tr>
  <td align="center"><b>01 · Capture & organize</b><br/><sub>One home for your screenshots, recordings and quick actions</sub></td>
  <td align="center"><b>02 · Refine & explain</b><br/><sub>Annotations and copy/save commands when you need them</sub></td>
</tr>
<tr>
  <td width="50%"><img src="docs/screenshots/settings.png" alt="Actual SNAPVERE application settings interface" /></td>
  <td width="50%"><img src="docs/screenshots/capture-overlay.png" alt="Actual React overlay render showing a real website screenshot instead of a black surface" /></td>
</tr>
<tr>
  <td align="center"><b>03 · Make it yours</b><br/><sub>Shortcuts, capture formats, audio and privacy controls</sub></td>
  <td align="center"><b>04 · See what you select</b><br/><sub>Verified on-screen frozen-frame presentation</sub></td>
</tr>
</table>

<sub>**Preview accuracy:** App UI screenshots use a simulated native Tauri bridge. The region-selection screenshot is driven by a real website-rendered image sent through the same in-memory RGBA interface as the application. These images prove which frontend UI was rendered, **not** real Windows hardware capture, recording quality, or exact pixel equivalence with the separately deployed public site.</sub>

<details>
<summary><b>🖼️ See the full interface gallery — preferences, compact layout and responsive website</b></summary>

### Workspaces

<img src="docs/screenshots/home-compact.png" alt="Real SNAPVERE compact gallery layout" width="750" />

### More settings, fewer interruptions

<table>
<tr><td width="50%"><img src="docs/screenshots/settings-hotkeys.png" alt="Real hotkeys preferences screen"/></td><td width="50%"><img src="docs/screenshots/settings-capture.png" alt="Real capture preferences screen"/></td></tr>
<tr><td><img src="docs/screenshots/settings-recording.png" alt="Real recording preferences screen"/></td><td><img src="docs/screenshots/settings-save.png" alt="Real local save preferences screen"/></td></tr>
<tr><td><img src="docs/screenshots/settings-privacy.png" alt="Real privacy preferences screen"/></td><td><img src="docs/screenshots/settings-about.png" alt="Real about screen"/></td></tr>
</table>

### Website — desktop and mobile

<table>
<tr><td width="60%"><img src="docs/screenshots/website.png" alt="Rendered SNAPVERE repository website on desktop"/></td><td width="40%"><img src="docs/screenshots/website-mobile.png" alt="Rendered responsive SNAPVERE repository website on mobile"/></td></tr>
<tr><td><img src="docs/screenshots/download.png" alt="Rendered download center desktop page"/></td><td><img src="docs/screenshots/download-mobile.png" alt="Rendered mobile download center"/></td></tr>
<tr><td><img src="docs/screenshots/privacy.png" alt="Rendered desktop privacy page"/></td><td><img src="docs/screenshots/privacy-mobile.png" alt="Rendered mobile privacy page"/></td></tr>
</table>

</details>

## SNAPVERE v0.2.12 — screenshot and recording workspace

The desktop interface now follows the repository website's navy/violet palette and interaction hierarchy more closely. The Home window presents three dedicated quick actions in order: **Capture region**, **Record screen**, **Full screen**, followed by gallery search and filters. Settings now groups the four capture-related sections first, then application-wide preferences, with keyboard navigation and responsive horizontal tabs in narrow windows.

The underlying screenshot, recording, gallery and export Rust commands are unchanged. Release v0.2.11 is a **candidate** until the PR has passed Windows CI and the UI previews have been inspected. Renderer screenshots validate composition, not exact pixel-parity with the separately deployed live WinUI website or real Windows hardware.

## What's improved in v0.2.10

- **Native, safer Save As:** the editor and capture overlay use the operating-system destination picker; the renderer no longer supplies an arbitrary path to native file-write IPC.
- **Scoped Tauri permissions:** the Home window alone can create Settings and confirm deletes; Settings alone owns its folder picker, autostart and opener rights. Capture and recording windows do not inherit those grants.
- **Stronger CI gates:** static per-window capability validation and a pre-merge check for duplicate Windows release tags reduce regressions and post-merge publishing failures.

**v0.2.10 was published on 14 November 2026** with the native Save As, scoped Tauri permissions and Windows installers. The separately deployed WinUI website binaries are unchanged. Physical Windows and 1:1 reference-image QA remain open.

## What's improved in v0.2.9

The [v0.2.9 GitHub release](https://github.com/bren-wp/Snapvere/releases/tag/v0.2.9) includes precision keyboard capture controls, smoother video playback, more resilient settings, recorder startup and buffer safeguards, and more maintainable native modules. Hardware-specific capture and recording scenarios still need verification on real Windows 10/11 systems.

## What's improved in v0.2.7

- **More reliable shortcuts:** Rebinding capture or recording shortcuts now preserves the previous keys if Windows rejects the new combination.
- **Cleaner full-screen captures:** The application window hides before Windows samples the display and returns afterward, reducing screenshots that accidentally contain the gallery.
- **A reliable editor:** Newly saved screenshots are explicitly authorized for the editor's image view. The preview test rejects unloaded or black editor frames.
- **Unified product identity:** The redesigned navy/violet website, app shell, feather icon, favicon, Windows executable icons, macOS icon and social preview share the same local source.
- **Clearer controls:** Accessible gallery card actions, narrower Settings layouts and status feedback for saving and changing hotkeys.

The source and interface images are built directly from the SNAPVERE project. Preview images verify rendered UI; hardware capture and recording still require device-specific validation.

## Built to stay out of your way

| | Everyday task | SNAPVERE workflow |
|---|---|---|
| 🧩 | **Report a bug clearly** | Select an area, mark the issue, copy or save the screenshot |
| 🎨 | **Review visual details** | Highlight, label and redact before handing off a screen |
| 📚 | **Create documentation** | Record an MP4/GIF walkthrough or annotate a still |
| 🔍 | **Locate past work** | Search filenames and tags in the local gallery |
| ⌨️ | **Stay in flow** | Trigger capture from the tray or a configured keyboard shortcut |
| 🛡️ | **Keep control of sensitive images** | Save captures locally, without a required cloud account |

**Local-first, by design.** Captures and gallery metadata are local. Sharing or exporting is a deliberate action. There are no in-app ads, donation prompts or mandatory user accounts for basic capture.

## Get SNAPVERE for Windows

**Latest confirmed repository release: v0.2.16 (16 November 2026).** SNAPVERE provides three Windows package formats with a SHA-256 manifest. Obtain the Tauri/Rust edition from [GitHub Releases](https://github.com/bren-wp/Snapvere/releases/tag/v0.2.16). The downloads on snapvere.com are maintained separately for the .NET/WinUI edition and are **not** interchangeable. GitHub labels v0.2.16 as a stable release, but physical Windows device QA is not documented; do not treat the stable badge as a hardware-validation claim.

| Package | Ideal for | Official download |
|---|---|---|
| 💻 **Portable EXE** | Run without installing SNAPVERE | [Snapvere-Portable.exe](https://github.com/bren-wp/Snapvere/releases/download/v0.2.16/Snapvere-Portable.exe) |
| 📦 **EXE Setup** | Guided installation | [Snapvere-Setup.exe](https://github.com/bren-wp/Snapvere/releases/download/v0.2.16/Snapvere-Setup.exe) |
| 🏢 **MSI Setup** | Windows managed installation | [Snapvere-Setup.msi](https://github.com/bren-wp/Snapvere/releases/download/v0.2.16/Snapvere-Setup.msi) |

**Requires:** 64-bit Windows 10/11 and Microsoft WebView2 Runtime. Portable means the SNAPVERE installer is not needed; some systems may still need WebView2 installed. These are **unsigned preview builds** and Windows SmartScreen may display a warning.

### Verify what you install

Download [SHA256SUMS.txt](https://github.com/bren-wp/Snapvere/releases/download/v0.2.16/SHA256SUMS.txt) **from the same package version**, then run:

```powershell
Get-FileHash .\Snapvere-Portable.exe -Algorithm SHA256
```

Compare the digest against the manifest. **Do not install files with mismatched hashes.** The website's live deployment is separate from this repository; verify that its displayed version and files match before downloading.

## Capture confidence — and current engineering work

An application should not show a black selection screen when a captured website is expected. The current code uses memory-based RGBA transfer, a PNG fallback and explicit error handling. The native packet format and visible frontend rendering have automated tests. Physical Windows verification remains required for protected content, mixed-DPI multi-monitor desktops, WebView2 variants and real recording workflows.

**Supported in this implementation:** Region screenshot capture, full-display capture, annotation tools, local gallery and screen recording.

**Not advertised as available:** Unimplemented active-window screenshot actions, private cloud upload or password-protected share links.

## For developers and reviewers

<details>
<summary><b>⚙️ Source architecture, verification and build instructions</b></summary>

**Stack:** Tauri 2, Rust, React, TypeScript, Vite, SQLite, Windows-native capture/recording integrations.

```bash
cd apps/desktop
npm ci
npm run build
npm run tauri -- build --bundles nsis,msi
```

The Windows build requires Rust/MSVC, WebView2-related build prerequisites, and Tauri packaging requirements. CI runs frontend typechecks, build and dependency audits; native Rust tests; installer builds; static website checks; branding parity; and real Chromium-generated UI previews.

```text
apps/desktop/src/               React UI: Home, Editor, Settings, capture overlay, recorder HUD
apps/desktop/src-tauri/         Rust app lifecycle, in-memory capture, recording and SQLite
site/                           SNAPVERE product, download and privacy website
docs/screenshots/               Automated real interface and responsive-site renders
tools/                          Screenshot, brand, capture-pipeline and site checks
.github/workflows/              CI, preview, dependency refresh and release workflows
```

**Dependency policy:** Use lockfiles for reproducible installs and test compatible updates before merging. Major framework upgrades that change generated CSS, runtime behavior or APIs must pass visual and native regression testing — never update versions just to make numbers look newer.

**License and attribution:** SNAPVERE/BRENDIGO is the product/publisher identity. Third-party dependencies and derived source remain subject to their legal notices; a brand refresh does not erase those obligations.

</details>

---

<div align="center">

### Make every capture count.

[**Discover SNAPVERE**](https://snapvere.com/) · [**Download for Windows**](https://snapvere.com/download/)

**SNAPVERE** · A product of **BRENDIGO**  
[🌐 snapvere.com](https://snapvere.com/) · [🏢 brendigo.com](https://brendigo.com/)

</div>
