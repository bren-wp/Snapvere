# SNAPVERE v0.2.14 — P1 integrity and IPC hardening report

**Base:** main commit `24fd192eeac66c175a9a3f291e062f3a793defa6` (GitHub release v0.2.13).
**Branch:** `fix/v0.2.14-p1-gallery-delete-recovery`  
**Pull request:** #24 (draft until CI and Windows QA).
**Status:** Implemented in PR; test execution and Windows packaging are tracked by GitHub Actions, not assumed.
**Audit input:** `SNAPVERE_FULL_GITHUB_AUDIT_2026-11-15.md` was not found in accessible repository or supplied attachments. Current GitHub source and history were inspected instead.

## Confirmed P1 defect

The previous `delete_screenshot` unlinked capture media **before** deleting its SQLite row. If a database write failed (e.g. SQLite I/O error, disk full, or busy failure), the gallery could retain a row referring to a missing file. Process termination between the file operation and SQL mutation had the same consequence.

## Changes implemented

- New `gallery_delete.rs` stages both capture and thumbnail via same-directory file renames. It does not follow symlinks, delete directories or overwrite existing paths during rollback.
- New `pending_deletions` SQLite table keeps the original and staged paths with a committed marker.
- Prepare intent and persist it **before** filesystem staging; atomically remove the screenshot row (including cascade tag relations) and mark the deletion as committed within a single SQLite transaction.
- On a failed stage or failed SQL transaction, restore staged files without overwriting any existing user file. If restoration is blocked, keep the pending journal so the next startup can recover.
- At startup, replay pending intents: restore pre-commit files, or complete post-commit file cleanup. Failed recovery does **not** replace the gallery with a blank database.
- SQLite synchronous mode raised from NORMAL to FULL, favoring durable write intent over peak write throughput.
- Restrict IPC entry points for frozen PNG/RGBA frames and overlay capture finish/cancel/reveal to the actual `overlay` WebView. Also restrict Home gallery listing/search/open/reveal/copy/tag/delete, capture initiation, Settings file/folder access, editor image export and recording metadata to their intended WebViews. Caller-owned paths remain prohibited for gallery deletion.
- Extend `tools/check_tauri_capabilities.py` to verify explicit Rust-side caller allowlists for 28 sensitive IPC commands; plugin capabilities alone do not enforce these checks.
- Remove the old non-transactional gallery row-delete method from the production implementation.

- A GIF recording with selected audio now fails validation; MP4 recording with missing requested microphone/system audio now aborts startup and reports an error before READY. Native recordings still require physical QA.

## Follow-up fixes from GitHub PR review and Windows CI

- Addressed Windows compiler error `E0597` in `Db::pending_deletions` by collecting mapped SQLite rows into a local variable before the statement drops.
- Added pre-migration `PRAGMA quick_check(1)`, atomic SQLite schema upgrades and schema version 1. Existing media and metadata are not cleared on failed startup.
- Recovery treats missing files as absent only when their parent folders are accessible. An offline/disconnected volume leaves the recovery journal intact instead of hiding its pending files.
- Locked or inaccessible committed staging files are deferred without preventing app startup. The journal is retained for the next attempt.
- Existing MP4 audio preferences remain saved when switching to GIF; GIF uses silent effective settings and displays disabled audio switches. Explicit audio-enabled GIF recorder arguments are still rejected.
- Added fault regression scenarios for disconnected media folders and failed post-commit cleanup.

## Regression tests added (not evidence of execution)

1. Deletion of media and thumbnail removes the SQLite record and leaves no pending journal.
2. Simulated interruption before SQL commit restores original data and metadata when the DB reopens.
3. Simulated interruption after commit removes staged media on reopening.
4. SQLite DELETE trigger failure leaves original media and row intact.
5. SQLite journal INSERT trigger failure (simulated storage-write failure) leaves original media intact.
6. A directory substituted for a regular media file is rejected without deleting its gallery entry.
7. GIF selected with either audio option is rejected; MP4 source-validation tests reject missing WASAPI inputs.

## Required acceptance before publishing

- [ ] Rust tests and Clippy on Windows, `cargo fmt --check`.
- [ ] Frontend TypeScript/build, i18n coverage, RustSec and npm audit.
- [ ] CI packaging outputs real Portable EXE, NSIS Setup EXE, MSI and checksum list.
- [ ] Physical Windows disk-full, locked files, power interruption and corrupt DB cases.
- [ ] Native MP4/GIF and audio capture, pause/resume, stop/discard and media finalization.
- [ ] Real screenshot comparisons for every UI state, multiple DPI configurations and all 12 languages.

**Release policy:** Do not claim physical QA or pixel-perfect equivalence from source inspection or CI alone. Keep the Tauri/Rust v0.2.14 GitHub release as a prerelease until Windows-device acceptance is documented. The public WinUI/.NET installers from snapvere.com are a different distribution and must not be replaced by this build.
