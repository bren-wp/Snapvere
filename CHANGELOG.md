# Snapvere by Brendigo — Release history

## v0.2.24 — secure crop boundary and gallery workflow (development)

- Fix scanline bleed at the right monitor boundary: the BGRA recorder now clips every row independently and fills out-of-bounds pixels with black instead of copying from the next row.
- Validate output size and frame offsets before accessing native buffers, with regression tests for truncated driver data, oversized coordinates, and short destination buffers.
- Add **Open capture folder** directly to the gallery toolbar using existing translations for all 12 languages. The native IPC permits only Home and Settings, never overlay, editor, or recorder views.
- Synchronize Cargo, Tauri and npm manifests/lockfiles to development version v0.2.24.
- Keep v0.2.23 installers published until all new CI and physical Windows checks complete.


## v0.2.23 — protected recording shutdown (development)

- Defer application exit during an active MP4/GIF recording to a single worker thread, keeping the GUI event loop responsive.
- Move native screen-source and encoder adapters into `record/transport.rs`, reducing the main recorder module by more than 100 lines.
- Extract the approximately 300-line recording worker loop into `record/worker.rs` to isolate frame acquisition, audio synchronization and finalization from lifecycle controls.
- Apply consistent publisher headers to canonical browser-extension scripts and their seven reproducibly generated sets, with a new static QA gate.
- Use overflow-checked, fallible, bounded BGRA allocations for full-monitor fallbacks and recording frames (up to 45 million pixels, including 8K); clear short fallback frames to avoid retaining pixels from earlier frames.
- Request recorder stop once, wait for the final media file and gallery entry, then exit the application. Do not exit silently after a finalization timeout; retain the resident process and record the problem in local diagnostics.
- Add concurrency regression tests for shutdown worker deduplication.
- Repair the broken `npm run format` script by pinning Prettier 3.10.1 with registry SHA-512 integrity and verifying the CLI in CI.
- Add a localized **Open Captures Folder** tray action across all 12 supported languages, reusing the authorized Settings folder-opening path rather than duplicating filesystem logic.
- Keep existing v0.2.22 release assets unchanged until the new build passes all quality gates and native Windows tests.


SNAPVERE is a Windows screenshot and recording workspace published by **BRENDIGO**.

## v0.2.22 — tray-first startup and preference reliability (proposed)

- Default to quiet login startup for fresh installations and installations without an explicit startup preference. Explicit user opt-outs remain authoritative.
- Prevent Windows startup from opening the gallery when a second instance is already running. Manual launches still bring the gallery forward.
- Abort initialization if the notification-area icon cannot be created, rather than leaving a hard-to-exit invisible process.
- Move login/startup logic from the main Rust entry module into a tested startup module with pure policy and argument checks.
- Extract recording HUD, overlay and frame positioning from the large IPC command file into a dedicated Rust module without modifying the public commands.
- Add Pause and Resume recording to the notification-area menu in all 12 languages, with phase-aware disabled states and a paused tooltip.
- Bound and rotate diagnostic logs during long-running sessions, with regression tests for line-size and newline injection.
- Improve Home heading legibility by reducing overly condensed letter spacing in capture and gallery titles, based on actual CI-rendered UI screenshots.
- Preserve existing system startup configuration when an invalid persisted autostart setting is detected.
- Disable the General startup toggle while its state is loading or changing. Persist choices immediately, and restore the previous preference and system entry if a change fails.
- Keep commercial installer text synchronized with the product's startup and privacy behavior while preserving independent MIT and third-party grants.
- Native Windows 10/11, login behavior under managed profiles and exact 1:1 reference matching still require device acceptance; no new binaries are represented as published.


## v0.2.21 — safe browser PNG export and trustworthy update status (development candidate)

- Browser extensions v0.2.1 render the **clean final PNG** for download and Windows clipboard, excluding dashed crop-selection outlines and unfinished pointer strokes. The editor preview retains visible selection guides.
- Browser area/edit captures verify the **original active tab before and after the browser screenshot**. If another tab becomes active, no screenshot is opened or saved. Added deterministic concurrency tests.
- Windows Settings no longer says **"You have the latest version"** when automatic update checks were disabled and no request ran. The interface shows a distinct idle state in all twelve supported languages. Server errors clear stale version-available notices; manual checks remain available.
- Playwright checks the automatic-updates-off state and manual retry without silently opting users back into automatic polling.
- Rebuild all seven browser-specific v0.2.1 bundles from the canonical extension sources and keep optional clipboard handoff fully local.
- Does **not** claim physical Windows 10/11, native camera/microphone, exact 1:1 pixel parity, browser-store publication, Safari signed package or automatic installer updates are verified.

## v0.2.19 — official self-hosted updates, manual dependencies and stability (release candidate)

- Add public version-only update feed check (`https://update.snapvere.com/stable.json`) with no cookies, redirection, telemetry, binary download or install. Home/Settings notifications support all 12 languages, user-controlled startup checks, official-only download link and manual retries.
- Defend against malformed product/version, nonofficial URLs, oversized manifests, unexpected content types and offline server failures. CSP permits only the update subdomain for outbound fetch; unit tests and network policy enforce the exception.
- Remove Dependabot bot configuration and scheduled updater workflow; explicitly refresh npm and Cargo graphs with tests and security reviews, then delete one-shot upgrade jobs.
- Upgrade Cargo major dependencies `windows`, `rusqlite` and `base64` and compatible npm packages only when Windows compiler tests, strict Clippy and RustSec succeed; keep lockfiles/SBOM synchronized.
- Fix unhandled Settings window creation/focus errors and diagnostics log opener failures.
- Make PrintScreen reliably start area selection while Snapvere is running in the tray, show Home when the EXE is launched manually and run invisibly only for opt-in Windows login autostart. Report the actual registered shortcut, offer a one-click PrintScreen rebind, and explain Windows Snipping Tool conflicts. Avoid self-capture when hotkey is pressed with the gallery visible.
- Remove GitHub and other external website links from the application UI; preserve official snapvere.com website, license and downloads.
- Add server deployment guidance in `docs/UPDATE-SERVER.md`. No actual signed installer update is implemented without a securely generated private signing key.
- Physical Windows 10/11, audio hardware, installed package upgrade and original per-screen 1:1 QA remain unverified.


## v0.2.18 — P1 Media Foundation COM cleanup and prerelease QA (development candidate)

- Fail MP4 startup on unexpected CoInitializeEx HRESULTs; handle S_OK, S_FALSE and RPC_E_CHANGED_MODE according to COM reference ownership.
- Release successful per-thread COM initialization when MFStartup fails before the session guard exists.
- Add Windows regression tests for COM status classification.
- Fix light-mode brand tokens, dark header/toolbar overrides, violet capture-card text contrast, and invalid RGB alpha styles.
- Synchronize Settings theme changes between open Tauri WebViews via storage and native event notifications.
- Expand Playwright visual state captures for light/dark, hover, focus, disabled GIF audio, recording palette and Stop error; require fail-closed PNG reference comparisons.
- Fix native recording HUD popup/error clipping: dynamically expand a caller-restricted 58px-to-216px WebView window, anchor toolbar bottom and correct mixed-DPI centering; assert popup bounds in screenshot tests.
- Track all unverified native WebView2/DPI cases in `docs/VISUAL-CORRECTIONS-v0.2.18.md` without claiming 1:1 parity.
- Verify/correct GitHub Release prerelease metadata during publication until physical Windows QA is documented.
- Correct README release status, document GitHub's 2026-11-18 withdrawal of GHSA-fc5q-39xc-vjpf without treating it as a patched version, and retain fork tests and strict npm audits.
- Update compatible npm packages: Tauri API 2.12.5, Tauri CLI 2.12.6 and Lucide 1.75.0, together with a regenerated lockfile; audit remaining Cargo-compatible upgrades on Windows.
- Fix viewer Fit-to-window clipping for huge screenshots; add pure geometry regression tests.
- Add synthetic 100/125/150/200% DPI snapshots for both themes and local-only PowerShell evidence collector for actual Win10/11 WebView2 windows.
- Replace stale write-enabled dependency refresh workflow with read-only freshness reports; expand Dependabot review policies, CI policy guards and npm/Cargo CycloneDX SBOM.
- Add release SBOM checksums; documentation: `docs/SECURITY-STABILITY-v0.2.18.md` and `docs/NATIVE-WINDOWS-QA-v0.2.18.md`.
- See `docs/AUDIT-v0.2.18-P1-com-release.md`. Native Windows acceptance remains pending.

## v0.2.17 — P1 bounded audio buffering and safe PCM decoding (published 2026-11-17, hardware QA pending)

- Bound microphone and system-audio WASAPI packet frame counts to two seconds of validated device sample rate; reject malformed oversized driver buffers before scratch allocation, while still releasing acquired packets.
- Decode PCM16, PCM32 and IEEE float32 with unaligned-safe byte-pointer reads, eliminating undefined behavior when a driver returns an unaligned sample pointer.
- Bound MP4 audio catch-up to the mixer's two-second retention capacity: refuse unrecoverable gaps instead of generating long, misleading silent audio tracks.
- Encode recoverable audio backlogs in <=500 ms blocks instead of one potentially excessive PCM allocation, preserving time ordering and existing failure-aware recording cleanup.
- Add hardware-independent Windows Rust tests for oversized packet counts, misaligned samples, audio backlog overflow/boundaries and 5.1/7.1 multichannel downmix.
- Preserve center-channel speech and side/rear surround from 5.1/7.1 Windows audio using speaker-mask-aware normalized stereo downmix; reject malformed speaker masks.
- Pin a temporarily patched, independently published `@ryotsu/picomatch@4.0.7-a` alias for build tooling to address upstream `CVE-2026-112366`; add source/provenance assertions and timed ReDoS regression tests. Replace with an official fixed release once available.
- Keep saved settings, 12-language interface, window-scoped Tauri IPC, crash-recoverable SQLite gallery and existing recording formats unchanged.
- Full physical Windows capture/audio/DPI/installer QA remains an explicit prerelease gate; see `docs/AUDIT-v0.2.17-P1-audio-memory.md`.

## v0.2.16 — P1 WASAPI runtime failure propagation (published 2026-11-16)

- Keep a thread-safe recorder health state for requested WASAPI microphone/system-loopback sources after initial readiness.
- Stop the capture session with an explicit error when `GetNextPacketSize`, `GetBuffer` or `ReleaseBuffer` fails, rather than interpreting driver errors as silence.
- Reject malformed non-silent audio buffers with null pointers while always releasing successfully acquired packets.
- Detect unexpectedly finished audio workers before writing frames, during pause and before final encoder flush; preserve the existing failure-aware MP4 finalization behavior.
- Keep real WASAPI silent packets legitimate; only operating-system errors and unexpected worker termination trigger the fail-fast path.
- Add hardware-independent Rust regression tests for the worker-health error state.
- Preserve 12-language localization, crash-recoverable gallery deletion, window-scoped IPC, SHA256 release checks and version identity.
- Physical Windows 10/11 audio/device-change and 1:1 visual acceptance remain unverified and mandatory for production claims.
- See `docs/AUDIT-v0.2.16-P1-audio-runtime.md`.

## v0.2.15 — P1 WASAPI format validation (published 2026-11-15, prerelease)

- Modularized Windows audio capture: the sample format decoder is now in `record/audio/format.rs`.
- Reject invalid WASAPI sample rate, channel count, sample type, precision, block alignment and malformed extensible data instead of silently producing silence.
- Free the COM mix-format allocation on validation failures and propagate the error through existing selected-audio startup checks.
- Add hardware-independent Windows format parser regression tests.
- Retain all 12 UI languages, the SQLite crash-recovery journal and scoped Tauri IPC without weakening their checks.
- Acceptance pending: native Windows CI, installation QA, audio hardware tests, and measured pixel-accurate screenshots.
- Details: `docs/AUDIT-v0.2.15-P1-WASAPI.md`.

## v0.2.14 — P1 integrity and IPC hardening (published 2026-11-15)

- Check existing SQLite integrity before schema changes; run schema migrations
  transactionally with an explicit database schema version.
- Defer file cleanup safely when media are locked or drives are disconnected,
  retaining recovery journals while permitting the app to open.
- Normalize effective GIF recording preferences to silent while preserving
  saved MP4 audio selections; reject explicit unsupported audio combinations.
- Journal gallery deletions before filesystem staging and atomically commit SQLite
  record removal; recover pending operations safely on restart.
- Restore original capture and thumbnail on failure; avoid following links,
  unlinking directories or overwriting existing user files on rollback.
- Restrict frozen-frame PNG/RGBA, capture completion, cancel and reveal IPC to
  the capture overlay window; add allowlist checks for 28 sensitive commands.
- Reject GIF audio options and fail recorder startup when selected WASAPI
  microphone/system audio is unavailable instead of silently losing audio.
- Add failure-injection and crash-window Rust tests and version metadata for a
  future verified **prerelease**, without claiming physical Windows QA.
- See `docs/AUDIT-v0.2.14-P1-integrity-ipc.md` for acceptance gaps.

## v0.2.13 — recording HUD recovery and localized gallery (development candidate)

- Keep the recording HUD usable after a failed Stop/Discard/Pause call so the user can retry rather than losing access to recording controls.
- Complete the catalog of 225 app-interface keys across English, Croatian, German, Spanish, French, Italian, Portuguese, Dutch, Polish, Czech, Slovak and Slovenian; translate all user-visible React screens, dialogs, tooltips, keyboard hints, privacy and About/license copy.
- Localize the native Windows tray menu and recording tooltip; propagate saved-language changes immediately to native menus and all React windows.
- Use localized date and size formatting and validate empty/missing/duplicate translations, dynamic labels, JSX text, tooltips and accessibility attributes in CI.
- Test recorder UI action retries and translated editor, viewer, gallery and overlay controls.
- Keep native recorder APIs and the Windows application identity unchanged until QA gates pass.

## v0.2.12 — recorder failure integrity (published 2026-11-15, pre-release)

- Wait for DXGI/xcap, Media Foundation, audio, encoder and frame-buffer initialization before reporting READY; return startup errors immediately.
- Propagate capture, video encoding, audio writing and finalization errors; do not register incomplete recordings.
- Attempt finalization and release native file handles even after a failure; retain both root and finalization errors.
- Add hardware-independent Rust regression tests and bump Cargo, Tauri, npm and lockfile version metadata.
- Restricted Settings Store permissions to Settings only; all capture windows now use typed, origin-checked Rust IPC snapshots and overlay audio toggle commands.
- Enforced native IPC caller window roles for capture startup, recorder controls, redact commands, gallery deletion and clipboard export; bounded redact rectangles to 32 within the active recording frame.
- Refuse startup instead of silently replacing an unreadable on-disk SQLite gallery with volatile in-memory history; display a native Windows error dialog and preserve database/media for manual recovery. Added corruption regression test.
- Fixed Rust test channel type inference (E0282) and removed the unused SQLite in-memory fallback reported by Clippy/dead-code checks.
- Added a cross-window language selector with English default and 11 optional languages; settings are validated and persisted via window-restricted Rust IPC, and capture/Settings core copy is translated.
- Removed the customer-visible LOCAL-FIRST and LOCAL LIBRARY marketing/dev labels, streamlined saved-gallery copy, simplified hotkey diagnostic wording and adjusted Settings UI for longer translations.
- Added translation catalog tests and frontend CI gate; unreviewed copy falls back safely to English.
- **Pending:** Windows CI, actual-device failure injection, tested backup/migration recovery, remaining IPC/security audit and visual acceptance. The v0.2.12 Windows preview release passed GitHub CI; physical device QA remains pending.

## v0.2.9 — premium stability candidate (unreleased)

- Split the gallery viewer into image/video/error modules; extracted Settings controls and validated preference model.
- Expanded video speeds (including 0.75× and 1.25×), added keyboard-seek accessibility, repaired corrupted volume preferences and reduced playback CPU updates to 10 Hz.
- Added keyboard precision selection: arrows move by 1 px, Shift+arrow by 10 px, Alt+arrow resizes, with tested viewport clamping.
- Split native PNG editor validation and recording pixel-processing into isolated Rust modules; improved negative-coordinate capture and truncated-driver-frame guards.
- Serialized recording startup, guarded session cleanup against stale workers and gave recordings distinct filenames.
- Recovered from blocked WebView storage and corrupt settings, rolled back failed autostart changes and handled failed save-folder dialogs.
- Added a React error boundary with a recovery screen so a component render failure does not silently blank the WebView.
- Fixed a focus/keyboard collision between the video seek slider and gallery navigation; recovered from WebView localStorage getter failures before the player mounts.
- Removed `innerHTML` from consent/download flows to reduce web-script injection risk.
- Added detailed source/permission audit evidence and verified release metadata across Cargo, npm and Tauri.
- Removed the obsolete native fs/os plugin dependencies and prepared an isolated, manually reviewed dependency lockfile refresh (including React 19 migration checks), with RustSec and npm advisory gates.
- Split gallery capture cards and empty-state views into independent components and added an AST-based dead-module reachability audit alongside TypeScript noUnusedLocals and Rust Clippy.
- Migrated the desktop design system to Tailwind CSS 4, with CSS-first tokens, explicit source paths, dark/light theme parity, updated PostCSS plugin and no legacy autoprefixer; full visual regression validation is still required.
- Addressed RustSec RUSTSEC-2026-0459 / CVE-2026-119375 by upgrading the bundled SQLite abstraction to rusqlite 0.42 and requiring libsqlite3-sys >=0.39 in every locked release, subject to passing Windows DB migration tests.
- Reduced release supply-chain exposure: prevent Git checkout from persisting write-capable credentials and install npm packages with lifecycle scripts disabled.
- Added an explicit offline-app source guard rejecting unreviewed outbound HTTP/process-launch primitives, install-time npm lifecycle scripts and hidden WebView network requests. Reviewed the only public third-party script: consent-gated Google Analytics, not the native app.
- Retired obsolete branch-specific privileged workflows for earlier 0.2.4–0.2.6 releases. The active dependency refresh remains scoped to this open PR.

**Release gate:** this version remains an unmerged candidate until Windows Rust fmt/test/Clippy, portable+NSIS+MSI, hashes and device-level acceptance are complete. The public website still serves a separate WinUI edition.

## v0.2.8 — November 13, 2026 (Tauri/Rust preview)

- Added a versioned Brendigo commercial-use installer license with an acceptance page for NSIS/MSI, matching first-party website terms and an in-app About link; previously issued MIT and third-party open-source rights remain intact.
- Reduced peak memory usage for PNG saves by encoding borrowed RGBA pixels; bounded gallery search and tag input; eliminated duplicate tag-join results in SQLite with a correlated EXISTS query.
- Bounded image clipboard decoding by source size and pixel dimensions; added a one-click Copy file path option (also Ctrl+Shift+C) for images and recordings; corrected the web download guide to reflect opt-in autostart.
- Replaced the 600 ms fixed delay during Quit with a bounded wait for actual recorder finalization and SQLite registration, reducing truncated recordings on slower storage.
- Changed Save As to stage complete image bytes in the destination directory and rename only after a successful write, preventing truncation of existing files when an export fails.
- Added a CI contract check for every frontend-to-Rust IPC command, plus an audit report distinguishing verified static checks from device-level and third-party security review still outstanding.
- Hardened website and application CI to reject public GitHub links and verify the installer license and legal navigation.
- Removed unused Tauri filesystem and operating-system plugins and corresponding webview capabilities from runtime, reducing the native IPC attack surface.

- Fixed screenshot cropping at negative virtual-desktop coordinates and monitor edges, with Rust regression coverage.
- Connected fullscreen, region and editor Save operations to persisted image format and quality settings; Save As defaults to the configured extension, recognizes JPEG and rejects unsupported extensions. Added Node unit tests.
- Preserve the overlay and annotations when export fails. Clean up partial captures and generated thumbnails on disk or gallery database errors; never delete original recorded video on indexing failure.
- Made gallery search treat literal %, _ and backslash correctly instead of unintended SQL LIKE wildcards.
- Added stable, bounded SQLite pagination and a Load more action so galleries and search results no longer silently stop at 300/500 items. The pagination cursor remains correct after deletion or refresh, with duplicate prevention and frontend unit tests.
- Kept SQLite foreign keys enabled in the in-memory fallback, preserving referential integrity of tags.
- Propagated tag query errors rather than silently losing tags.
- Restricted environment-supplied WebView2 remote debugging flags to debug builds.
- Removed CI auto-commits of generated source/images and excessive quality workflow write permissions.
- Introduced non-mutating Rust formatting, strict Clippy gating, and a working TypeScript static-analysis lint command.
- Removed old release-note claims and distinguished the GitHub Tauri edition from the separately deployed .NET/WinUI website.

**Release type:** preview, pending native Windows hardware, DPI, multi-monitor, audio, install/upgrade and pixel-perfect reference validation. The TypeScript compiler's strict and unused-symbol checks are enforced; ESLint is not yet a locked dependency and must be added separately before claiming ESLint coverage.

## v0.2.7 — November 2026

- Improved Windows global shortcut rebinding with rollback and duplicate-key validation.
- Fixed dynamic version display, shortcut preferences and accessible Settings controls.
- Hidden gallery during full-screen capture, restoring the window afterward.
- Authorized newly saved files for immediate viewing in the editor.
- Replaced the old screenshot mockup with real source-rendered application previews.
- Aligned native and website navy/violet design tokens and regenerated matching favicon, ICO, ICNS and PNG assets.
- Added a visual check that rejects black or unloaded editor previews.
- Updated README, responsive-site review and Windows release QA.

**Validation requirements:** frontend/TypeScript build, npm audit, Rust tests, formatter, Windows Portable/NSIS/MSI packaging and SHA-256 verification. New binaries are not described as signed when no signing certificate is available.

## v0.2.6 — November 13, 2026

- Moved region screenshot transfer to in-memory RGBA with PNG fallback.
- Improved failure cleanup and tests for screenshot selection.
- Updated Tauri frontend/native dependencies and real screenshot documentation.
- Published Portable EXE, Setup EXE, MSI and SHA256SUMS.txt.

## Note on the public website

The separately deployed public snapvere.com currently serves a different implementation and its routing/assets are managed independently. Repository screenshots do not certify 1:1 identity with the deployed live site.
