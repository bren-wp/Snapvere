# SNAPVERE — Verification matrix and outstanding work

**Publisher:** BRENDIGO · https://brendigo.com  
**Product:** https://snapvere.com

This file replaces the outdated initial-project scaffolding task list. It documents engineering verification rather than claiming future features are complete.

## Verified in source / CI

| Area | Status | Evidence / verification |
|---|---|---|
| Site assets and first-party downloads | Implemented | SHA-256 manifest verification and website path checks |
| App and web visual tokens | Implemented | `tools/check_brand_tokens.py` |
| Brand identity in tracked paths/content | Implemented | CI search and `tools/check_capture_pipeline.py` |
| Home, Settings, Editor, website previews | Implemented | Playwright-generated images in `docs/screenshots` |
| Screenshot frozen-frame binary transfer | Implemented | Tauri IPC, header/pixel validation and PNG memory fallback |
| Black-overlay error handling | Implemented | Cancel and report failure rather than display an empty canvas |
| Windows package build | v0.2.36 published; v0.2.37 candidate | Native build workflow; six Windows and four Linux packages, SBOM, notice and checksum manifest and physical Windows QA still required |
| Recording subsystem and HUD | Implemented | Rust/React source, release tests; live Windows device QA still required |

## Current release evidence

Main commit `3c6846255422d314f48c13a7c269fd5644df7d1f`: [quality](https://github.com/bren-wp/Snapvere/actions/runs/45723826076), [visual](https://github.com/bren-wp/Snapvere/actions/runs/45723826041) and [release](https://github.com/bren-wp/Snapvere/actions/runs/45723825969) passed. These are automated checks, not physical-device certification. The published v0.2.36 preview is newer than this historical baseline; the v0.2.37 candidate requires fresh exact-revision CI. See [audit register](AUDIT-2026-11-26.md).

## Acceptance tests still requiring real Windows hardware

- Region capture over Chrome, Edge, desktop wallpaper, regular applications and multi-monitor configurations.
- Confirm rendered selection matches the desktop visually at 100%, 125%, 150% and 200% DPI, including negative virtual monitor coordinates.
- Confirm no black rectangle is shown when selecting a browser page; test the in-memory fallback under older WebView2 versions.
- Test full-screen capture, screen recording, pause/resume, microphone/system audio and short/long recording finalization.
- Validate v0.2.23 asynchronous Quit behavior with MP4/GIF finalization, timeout, and repeated Quit requests; do not report hardware acceptance from unit tests alone.
- Confirm overlay/HUD remain above the intended monitor but do not appear inside screenshots or recordings.
- Check keyboard navigation, focus outlines, 200%-400% zoom and accessibility for every primary window.
- Compare each shipping screen against the approved visual reference at matching viewport dimensions; measure and correct differences before describing the result as pixel-perfect.
- Confirm first-party website deployment and versioned downloads after merge; branch screenshots and released packages are separate from live deployment.

## Excluded from shipping UI

No placeholder active-window capture, incomplete private upload buttons, mock donation features, unverified cloud upload claims or stale version banners.

## Release policy

Do not merge without passing relevant CI jobs. Publish a fresh set of Portable EXE / Setup EXE / MSI assets with checksums after a validated release revision. Confirm Windows behavior on physical hardware before marking the build production stable.

The live public site currently presents a separate release technology and version. Reconcile public-product metadata, licensing and technical capability before replacing the live site with repository HTML.


## Candidate recovery schema v2

New deletion intents persist parent and leaf native identifiers, including known absence, before staging. Stage, precommit, rollback and committed cleanup validate these identifiers. Existing schema v1 rows are preserved; unknown identities are deferred for manual recovery, never inferred. Back up the gallery database and media together before upgrade; do not downgrade to an older application after migration. Physical filesystem, restart/power-loss and adversarial leaf replacement acceptance remain required.
