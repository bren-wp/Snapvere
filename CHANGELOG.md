# Snapvere by Brendigo — Release history

## v0.2.32 — Release integrity (development)

- Expand crop-local annotations with bounded cached raster spans, transactional drawing-only undo/redo, protected committed masks and real encoder/decode fixtures.

- Add experimental paused crop-local preview and native rectangular annotations/opaque masks applied to future encoder frames, independent of global Wayland window placement.

- Validate output-local redaction viewport and map mask edges outward in Rust; add headless wlroots mixed-DPI compositor geometry acceptance.

- Bind experimental Wayland logical overlay selection to validated per-output physical crop dimensions and portal video caps, with strict monitor/viewport identity checks.

- Add independent Wayland compositor output inventory and exact inward fractional logical-to-physical region mapping; retain capture gating until real mixed-DPI overlay and stream validation.

- Validate explicit portal monitor geometry and native overlay coordinates for experimental regional capture and single-monitor selection in unscaled multi-monitor layouts; reject ambiguous or scaled layouts.

- Harden experimental Wayland portal ownership, revocation, bounded paused-frame discard, stream metadata validation and teardown before file finalization.

- Add an opt-in continuous Wayland ScreenCast Portal/PipeWire video source for one full monitor, with consent-scoped remote, bounded startup and validated BGRA capture. Native compositor acceptance pending.

- Add experimental bounded fractional audio-clock drift compensation and four-hour simulations, plus native X11 framebuffer acceptance in Free/Pro and monitor-geometry checks.

- Add experimental graphical audio source selection backed by the live native PipeWire registry, settings-window-only IPC and session-scoped selection, without persisting stale serials.

- Validate experimental Linux audio selections against native PipeWire node roles and server identity; reject stale sessions and reversed roles, and retain strict Rust formatting/dead-code checks.

- Wire the experimental Rust recorder to the native AAC encoder and explicit dual-input PipeWire mixer, with bounded PCM/video-clock alignment, pause teardown, same-target resume and fail-closed audio health checks. Public capabilities remain disabled.

- Add an experimental native AAC branch to the Linux MP4 adapter, plus real PipeWire PCM-to-AAC/H.264 mux, pause/resume and missing-device regression tests. Production recorder integration remains gated.

- Add an isolated native PipeWire PCM transport acceptance test with virtual source and sink-monitor devices, explicit target selection and missing-target rejection. No audio capability enabled yet.

- Introduce an opt-in native Linux H.264/MP4 encoder using GStreamer and an anonymous output inode, with real codec/decode CI tests. It is not enabled in public packages; PipeWire audio and native acceptance remain open.
- Fix Clippy pixel conversion lint without disabling checks.

- Linux Pro export publishes from an anonymous synced inode without a replaceable staging pathname; unsupported destination filesystems fail safely. Windows named staging remains under audit.
- Reject changed capture geometry in the native xcap fallback to preserve region and redaction correctness; validate lockfile registry provenance and integrity.

- Pro export stages and syncs output before publishing without replacement, pins the selected destination and rejects multiply linked source handles. Linux and Windows native regression verification pending.

- Pro batch export continues after individual failures, returns per-capture success status and keeps failed IDs selected for retry; cancellation preserves selection.
- Open and validate source handles, reject final symlink/reparse redirection on Linux/Windows, and bound original-copy writes to the validated size. Parent directory races and crash-safe publication remain under review.

- Gate preview publication on successful quality and frontend visual checks for the exact main commit.
- Reconcile unsigned Tauri release metadata from v0.2.25 onward, including future releases, without touching drafts or the legacy channel.
- Keep all ten native packages as unsigned previews until signing and real native acceptance are verified.
- Native device QA, commercial Pro entitlement, four isolated update channels and Linux recording parity remain open.

## v0.2.31 — Shared gallery reliability and Pro export preferences (development)

- Both Windows and Linux, Free and Pro: uncropped gallery previews, lazy asynchronous decoding, safe fallback from a failed thumbnail to a registered still image, and localized unavailable-preview state. Recording files never become still-image fallback paths.
- Show localized capture dates and GB/TB media sizes in both editions.
- Pro: persist the last validated export preset locally; safely recover if preferences are invalid or inaccessible. Flag oversized images in loaded selections using the native 64 MiB / 24 MP limits. Native validation remains authoritative.
- Linux MP4, system audio, microphone and cursor compositing remain open native parity tasks; do not advertise unimplemented capabilities. Native OS visual comparison and hardware acceptance remain required.

## v0.2.30 — Pro batch workspace (development)

- Warn about known incompatible selected files before image-preset export and offer explicit deselection of incompatible loaded files. Keep hidden selection intact for native validation; no original file is deleted. Localized feedback in all 12 languages and regression coverage.

- Add native Pro batch export presets: original files, original-size PNG, PNG up to 1280 px, and lossless WebP up to 1920 px. Resize without upscaling; keep originals, alpha and aspect ratio. Reject recordings in image-only presets before any export, cap input at 64 MiB/24 megapixels per image, validate formats and use exclusive synchronized output writes. Native picker and Free gating remain mandatory. All 12 locales updated.

- Add Pro selection of captures from the last seven days, files of at least 10 MiB, and items without tags; all twelve locales supported.
- Show known selected loaded bytes and selected IDs outside the current loaded gallery, with explicit keep-loaded-only action. No disk or network scan.
- Fix inversion at the 100-item cap by freeing old loaded slots before selecting replacements. Duplicate gallery IDs no longer toggle twice.
- Guard batch export with an immediate lock; prevent duplicate export requests, batch exit and selection changes during export. Block gallery deletion while the export dialog or copy is active.
- Preserve Free workflows, native Pro gating, offline export, and all ten platform packages. CI and native QA required before publication.


## v0.2.29 — Pro Studio and release reliability (preview)

- Fix the post-merge GitHub release failure: resolve private draft releases by their authenticated release ID, verify all required files and SHA-256 coverage, and publish only the verified draft as an unsigned prerelease.
- Free remains a fully usable offline screen capture, GIF/Windows MP4 recorder, annotation editor and local gallery.
- Pro Studio now has a visibly distinct professional workspace and direct navigation to advanced recording profiles and batch operations, in all twelve supported UI languages.
- Expand Pro workflows to eight optimized recording presets (Tutorial, Presentation, Compact GIF, Webinar, Smooth 60 FPS, Maximum Detail, Social Clip and Detailed GIF) and six private custom profile slots; preserve the first three saved profiles when upgrading.
- Add Pro-only gallery batch selection of images, videos, captures from the last 24 hours, tagged items, all loaded captures and inverse selection. A compact read-only Pro Insights panel shows image/video/tag counts and loaded gallery storage. Export remains native-gated, offline and limited to 100 items.
- Linux applies GIF-only silent recording constraints instead of falsely enabling MP4/audio/cursor capture. Pro remains a separate preview edition without payment entitlement or signing.
- New releases must include Free and Pro Windows Portable/Setup EXE/MSI, Linux DEB/AppImage, browser source ZIPs, SBOM and integrity hashes; do not bypass CI or hardware QA gates.


## v0.2.28 — Free and Pro editions (unreleased; native build and QA pending)

- Publish **two separate build flavors** from one audited Tauri/Rust codebase: Snapvere Free (`com.brendigo.snapvere`) and Snapvere Pro (`com.brendigo.snapvere.pro`), without restricting any existing Free features.
- Pro adds Tutorial, Presentation and Compact GIF recording presets plus three private, locally persisted custom recording profiles, translated for twelve languages. Linux applies GIF-only safe profiles; unsupported MP4/audio paths stay disabled.
- Pro update checks are offline/manual-only until a dedicated Pro-signed feed exists; no Free installer is proposed as a Pro upgrade. No accounts, payment processing or cloud uploads are added.
- Keep robust GIF static-frame coalescing and exclusive recording-file creation tests.
- Enforce distinct Windows Portable/Setup/MSI and Linux DEB/AppImage assets for both editions in CI and release, including SHA-256 verification. No unsupported 32-bit/ARM64 label.
- **The Pro build is not yet a paid, license-enforced product**. A secure entitlement and customer delivery process require additional audited work.

## v0.2.27 — Local storage durability and distribution compatibility (unreleased, pending CI/physical QA)

- Sync newly created PNG/JPEG/WebP captures to disk before indexing them in SQLite; reject failed persistence, preserve existing media, and add regression tests.
- Sync finalized MP4/GIF recordings and reject non-regular/symlink or truncated outputs before gallery registration.
- Name new recordings using a full 128-bit UUID instead of an abbreviated filename suffix.
- Add an explicitly user-initiated Linux link to official release downloads; do not silently activate the Windows-only update feed.
- Attempt x86_64 RPM builds in Linux quality CI as private **UNTESTED** artifacts, alongside current Debian and AppImage bundles, with CPU/dependency/checksum checks. Fedora-native installation is not yet certified.
- Document x86_64 versus 32-bit x86 and ARM64 packaging limits, and strict privacy requirements for potential opt-in SFTP/HTTPS or hosted cloud integrations. Do not enable any upload/telemetry.
- Update Cargo, Tauri, npm and lockfile versions together. Production release awaits full CI and real-device acceptance; previews must not be misrepresented as signed/stable.

## v0.2.26 — Windows/Linux parity work and release-channel hardening (unreleased, pending CI/QA)

- Avoid duplicate full Windows/Linux CI builds for one commit by running quality on PRs and post-merge main, with manual branch dispatch preserved.
- Fail safely when a selected monitor is disconnected instead of silently capturing a different monitor; reject mismatched region and monitor IDs, with unit regression tests.
- Clamp recorder HUD and annotation overlay positions across mixed-DPI and extreme virtual desktop coordinates.
- Make GIF recording quality meaningful on both Windows and Linux: adjustable 480/720/960-pixel output cap and palette sampling effort, keeping quality 80 at the familiar 960-pixel maximum.
- Keep GIF quality available in shared Settings, with browser regression checks for both platforms.
- Full Windows/Linux physical QA, authenticated signing and publication remain pending.

## v0.2.26 — Windows edition channel isolation (unreleased, pending CI/QA)

- Route Tauri/Rust updates to a dedicated download guide, never to incompatible WinUI/.NET installers.
- Identify existing WinUI/.NET v0.2.4 packages clearly; preserve their bytes and hashes.
- Restrict approved release destinations and add regression checks for edition separation.
- Synchronize Cargo, Tauri and npm manifests and lockfiles. Signing, native QA and publication remain outstanding.


## v0.2.25 — responsive browser extensions and bottom-right update notices (development)

- Extend popup Chromium regression coverage to the user's 260 px narrow browser toolbar width, including minimum 40 px capture button height and horizontal overflow checks in both themes.

- Resolve Home toast collisions: the corner update notification moves up while a transient capture/action message is visible, preserving both messages without clipping or overlap.
- Report accepted browser PNG downloads as started, rather than prematurely claiming completion before the browser finishes writing the file.

- Restore normal popup width in Chrome, Edge, Brave, Opera, Vivaldi, Firefox and Safari by giving the extension document a stable preferred width instead of constraining `body` with `100vw`; polish icon/label alignment and small-window controls.
- Bump the independently versioned browser source distributions to v0.2.2 and extend real Chromium layout checks at five viewport widths in dark and light modes.
- Move the existing official first-party update alert in the Tauri Windows Home to a bottom-right in-app notification, preserve close-per-version across restarts and synchronize the Settings opt-out with Home.
- Keep version-only HTTPS update notices separate from signed installer deployment: never silently download or execute releases.
- Align all Windows Cargo/npm/Tauri versions and release gates to v0.2.25; Windows native acceptance and store-signed browser distribution remain required before production sign-off.


## v0.2.24 — secure crop boundary and gallery workflow (development)

- Fix scanline bleed at the right monitor boundary: the BGRA recorder now clips every row independently and fills out-of-bounds pixels with black instead of copying from the next row.
- Validate output size and frame offsets before accessing native buffers, with regression tests for truncated driver data, oversized coordinates, and short destination buffers.
- Fail closed when a frame cannot be safely redacted: zero incomplete pixel buffers instead of silently leaving sensitive unpixelated content.
- Add **Open capture folder** directly to the gallery toolbar using existing translations for all 12 languages.
- Keep the gallery's folder and clipboard actions together as a responsive group instead of orphaning the clipboard action on a separate row at compact window widths.
- Keep the per-capture **Show in folder** and **Delete** buttons visible on touch devices (no hover required) with larger touch targets; preserve keyboard focus and desktop hover behavior.
- Add one-click **Copy file path** to every gallery card, using the existing Home-only native IPC clipboard command and localized feedback (no new webview permissions).
- Look ahead by one SQLite result when loading each page, so **Load more** appears only if another older capture actually exists. The look-ahead row is neither rendered nor counted as loaded.
- Apply **All / Images / Videos** in the SQLite query before pagination, instead of filtering only the first 120 loaded items.
- Prevent missing older captures after deletion from a paginated gallery by adjusting the SQL offset and invalidating pre-deletion requests.
- Harden asynchronous gallery loading: newer searches and refreshes invalidate older paging tasks immediately, and stale completion handlers cannot cancel the busy state of a newer request.
- Fix a review-identified stale-closure bug: a clipboard import or recording completing after a filter change must refresh using the **current** gallery query and category, not the earlier callback's captured values. Persist a retry banner when a refresh fails but cached gallery cards remain visible. Show a localized retry action instead of a misleading empty-gallery state when loading fails. Search, tags, and older capture paging now share the same bounded query. The native IPC permits only Home and Settings, never overlay, editor, or recorder views.
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

- Optimize large galleries with a composite SQLite ordering index on `(created_at DESC, id DESC)` and retire the redundant timestamp-only index through the transactional migration; add regression coverage.
- Add an accessible **Refresh gallery** action with labels in all 12 languages; it respects the current search/filter and prevents duplicate refreshes while loading.

- Improve keyboard productivity without changing the gallery layout: **Ctrl+F / Cmd+F** focuses and selects the gallery search field; **F5** refreshes the selected category and query (only while the gallery, not the viewer, owns the keyboard). Added shortcut collision regression coverage.

- Fix Codex-reported P2 keyboard propagation bug: register Home's shortcut handler in the capture phase, so Ctrl/Cmd+F and F5 work even when a capture-card Reveal/Copy/Delete button has focus; stop native WebView hard reload in that state. Advertise both shortcuts via `aria-keyshortcuts` and regression-test capture-phase registration.

- Harden media Viewer keyboard shortcuts: plain F, Delete and arrows no longer react to Ctrl/Cmd/Shift/Alt-modified combinations; Ctrl+F/Cmd+F cannot unexpectedly toggle fullscreen, Ctrl+Delete cannot initiate deletion, and video Ctrl+C no longer hijacks text clipboard. Keep explicit Ctrl/Cmd+Shift+C for copying the registered file path with localized error messages; add regression tests.

- Harden crash-recovery of deleted media: reject a staged file replaced with a directory or symlink before restoring it into the gallery, leave the durable journal pending, and recover normally once the valid staged file returns. Add a portable restart/recovery regression test.

- Polish Viewer accessibility: modal overlay now receives initial keyboard focus, keeps Tab/Shift+Tab inside its controls, restores focus to the launching gallery card after close, and honors Escape even while the recording scrubber is focused. This changes no visible layout; add focused-dialog boundary regression tests.

## Edition package and security hardening — v0.2.28 preview

Pro adds native-only multi-selection and local batch gallery export with an
OS folder picker, a maximum of 100 registered UUIDs, exclusive destination
creation, format and symlink checks, local streaming copy and durable sync.
The existing Free executable always rejects the Pro native IPC, independent
of a modified WebView or user-configurable settings. Pro also includes its
own title and app-data identifier; it has no cloud access or activation server.

The v0.2.28 release job now builds and runs native tests for **both** editions
and stages six Windows and four Linux artifacts. The release remains a private
**draft** until actual assets, dependency inventory and SHA-256 manifest have
been checked. Only then is it published as an **unsigned prerelease**. The
legacy Free updater remains version-notification-only; Pro has no dedicated
remote updater. Fedora RPM remains internal QA-only and 32-bit/ARM64 require
new binaries, not renamed files.
