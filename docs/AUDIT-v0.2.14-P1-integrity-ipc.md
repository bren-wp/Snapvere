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
- Restrict IPC entry points for frozen PNG/RGBA frames and overlay capture finish/cancel/reveal to the actual `overlay` WebView. Caller-owned paths remain prohibited for gallery deletion.
- Remove the old non-transactional gallery row-delete method from the production implementation.

## Regression tests added (not evidence of execution)

1. Deletion of media and thumbnail removes the SQLite record and leaves no pending journal.
2. Simulated interruption before SQL commit restores original data and metadata when the DB reopens.
3. Simulated interruption after commit removes staged media on reopening.
4. SQLite DELETE trigger failure leaves original media and row intact.
5. SQLite journal INSERT trigger failure (simulated storage-write failure) leaves original media intact.
6. A directory substituted for a regular media file is rejected without deleting its gallery entry.

## Required acceptance before publishing

- [ ] Rust tests and Clippy on Windows, `cargo fmt --check`.
- [ ] Frontend TypeScript/build, i18n coverage, RustSec and npm audit.
- [ ] CI packaging outputs real Portable EXE, NSIS Setup EXE, MSI and checksum list.
- [ ] Physical Windows disk-full, locked files, power interruption and corrupt DB cases.
- [ ] Native MP4/GIF and audio capture, pause/resume, stop/discard and media finalization.
- [ ] Real screenshot comparisons for every UI state, multiple DPI configurations and all 12 languages.

**Release policy:** Do not claim physical QA or pixel-perfect equivalence from source inspection or CI alone. Keep the Tauri/Rust v0.2.14 GitHub release as a prerelease until Windows-device acceptance is documented. The public WinUI/.NET installers from snapvere.com are a different distribution and must not be replaced by this build.
