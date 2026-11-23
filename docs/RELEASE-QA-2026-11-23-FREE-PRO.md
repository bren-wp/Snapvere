# SNAPVERE Free + Pro — release and security acceptance

**Target:** 0.2.28 · current implementation is a draft PR, not a published
signed/stable release. An actual passing CI run is required before any merge.

## Changes implemented in source

- Free remains the complete offline editor, capture, local gallery and
  screenshot/GIF/Windows-video recorder. No existing capture option has been
  intentionally moved behind a paywall.
- Pro uses a distinct Tauri application ID and app-data path, with professional
  recording presets, three private user profiles and a native-only multi-select
  gallery export to an explicitly selected local folder.
- Export batches accept 1–100 gallery UUIDs, open the native OS folder picker,
  reject symlinked sources and unsupported formats, use exclusive new output
  files, bounded-memory stream copy, sync completed outputs and remove partial
  outputs on write failure. The Free native feature rejects Pro IPC.
- No FTP, SFTP, remote account registration, OAuth, background telemetry or
  cloud upload code has been added. A user-selected folder may itself be
  synchronized by third-party software; that is outside Snapvere's control.
- Static GIF coalescing skips repeated visual frames but preserves accumulated
  centisecond playback time; GIF file creation is exclusive and does not
  overwrite pre-existing media.

## Mandatory QA gates

| Test | Free | Pro |
|---|---|---|
| TypeScript, lint and unit tests | required | required |
| Windows Rust test and strict Clippy | required | required with `--features pro` |
| Linux Rust test and strict Clippy | required | required with `--features pro` |
| Native startup, hotkeys, capture and real file export | physical QA missing | physical QA missing |
| Local-only network monitoring | physical QA missing | physical QA missing |
| UI layout / DPI / touch / accessibility | physical QA missing | physical QA missing |
| Windows x64 Portable / NSIS / MSI | CI required | CI required |
| Linux x64 DEB / AppImage | CI required | CI required |
| Fedora x64 RPM | QA-only / NOT released | QA-only / NOT released |
| 32-bit x86 and ARM64 | NOT built | NOT built |
| Authenticode, repo release signing | missing | missing |

The release workflow **must refuse to publish** until the Draft has exactly
six distinct Windows and four Linux packages plus all seven extension ZIPs,
SBOM, Free version-only update manifest and integrity hash manifest. The
release may then be made public only as an unsigned prerelease. The Pro edition
is a **feature preview without entitlement enforcement**; it is not a secure
paid-license product yet.

## Follow-up security and quality gaps

- Verify native full-screen capture on Windows 10/11 (multi-monitor, mixed DPI,
  lost devices and screen lock). Verify GIF playback lengths on all platforms,
  MP4 muxing/audio on Windows, and offline/interrupted full-disk writes.
- Verify X11 and Wayland capture, thumbnail lifecycles, save-as, file picker,
  AppImage launch, DEB install/uninstall and Fedora-native RPM dependency
  resolution. CI compiled packages alone are not proof of runtime behavior.
- Review symlink and time-of-check/time-of-use races in local file access, and
  verify filesystem permissions for the OS-picked export destination.
- Use a reproducible test device matrix for visual 1:1 comparisons; matching
  source UI is not enough to prove pixel-identical screenshots.
- Add secure, explicit, separately opted-in SFTP/WebDAV/HTTPS connection
  modules only after credential-store, server-cert/SSH host-key, storage
  encryption, retry/resume, privacy and deletion tests are complete. Do not
  add plaintext FTP with reusable credentials.
- Design any hosted Snapvere cloud and commercial license verification as
  separate audited services. No functioning cloud account/backend or payment
  entitlement system exists in this release candidate.

Audit gates cover code reachable from production entrypoints, locked
dependencies, Chromium/UI regressions, static scanner rules and known advisories.
They cannot establish the absolute absence of vulnerabilities, unsupported
third-party traffic or production-device-specific failures.
