# Snapvere by Brendigo — v0.2.22 startup, tray and code audit

**Scope:** Tauri/Rust startup, native notification area, existing persisted
preferences, Settings UI and installer license text. The entire application's
dead-code, dependency, recording and visual acceptance status is **not**
re-certified by this focused change.

## Review findings and changes

| Area | Finding | Change | Verification |
| --- | --- | --- | --- |
| First-run behavior | Missing `autostart` stored key disabled startup on every login | Treat no explicit choice as enabled; preserve stored false | Rust pure policy unit tests |
| Duplicate launches | Single-instance callback always opened gallery, including hidden startup invocations | Respect the exact hidden-startup argument even for second instances | Rust argument regression tests |
| Tray reliability | A failed tray creation left a process that was hard to control | Stop setup on tray initialization failure with diagnostic logging | Rust compiler/CI, Windows runtime required |
| Settings persistence | Startup toggle could be used before OS state was read, and relied only on deferred auto-save | Block toggle while loading/applying; explicitly save; attempt rollback on errors | TypeScript and Windows integration tests pending |
| Code structure | Login policy lived in large `lib.rs` and duplicated the command-line flag tests | Move into `startup.rs`; register the module once | Static reachability/Clippy CI pending |
| Localization | General settings incorrectly described startup as off | Update source and all 11 translated variants | Existing localization tests pending |
| License | Installer agreement omitted background startup and separate distribution channels | Update bundled text EULA and matching RTF while preserving source MIT rights | Text consistency check; qualified legal review outstanding |
| Presentation | README still described v0.2.21 as not released | Correct published-version statement, add user-facing startup guidance | Documentation review |

## Source and supply-chain rules

Existing `tools/check_dead_code.mjs`, `tools/check_rust_modules.py`,
`tools/check_tauri_capabilities.py`, `tools/check_no_backdoor_patterns.py`,
the Rust Clippy job, npm auditing and RustSec remain required gates.
The release version is updated in npm, npm lockfile, Cargo manifest, Cargo
lockfile and Tauri configuration to preserve a consistent artifact identity.
Third-party dependency versions are **not** changed without a compatible,
reviewed lockfile update and security/build verification. A version bump by
itself is not a vulnerability fix.

The repository's `LICENSE` remains MIT for the source it covers. The
commercial EULA is a distribution agreement, not an attempt to withdraw MIT
rights. Binary installer terms and source licenses have distinct purposes.

## Real Windows acceptance checklist

- [ ] Fresh Windows 10 install: auto-launch after sign-in, no gallery pop-up
- [ ] Fresh Windows 11 install: auto-launch after sign-in, one tray icon
- [ ] Upgrade with saved `autostart: false`: remains off after reboot
- [ ] Turn startup on/off and reboot; verify native Windows startup entry
- [ ] Start the EXE again manually: existing Home opens exactly once
- [ ] Invoke hidden startup with instance running: existing Home remains hidden
- [ ] Click Home window X: resident tray and hotkeys remain active
- [ ] Tray Quit exits cleanly; active recording finalizes or reports a failure
- [ ] User pins Snapvere beside clock through Windows taskbar settings
- [ ] Validate 100%, 125%, 150% and 200% DPI layouts against approved references
- [ ] Check the exact native screenshot images, fonts, hover/focus and error states
- [ ] Confirm MSI/NSIS installer agreement, upgrade and uninstall behavior

**Status:** Source changes committed to a review branch. Test results and
native-screen 1:1 acceptance must not be inferred from code review alone.
