# SNAPVERE v0.2.16 — P1 runtime audio integrity audit

**Baseline:** merged main SHA `f2e7003dcefca8d4120f9a51f0c85050d7ab58f1`, published v0.2.15 prerelease.

## Defect

Previously, Windows WASAPI `GetNextPacketSize()` failures were converted to zero packet count by `unwrap_or(0)`. `GetBuffer()` failures merely exited the inner processing loop, and `ReleaseBuffer()` results were ignored. After microphone/loopback initialization, a disconnected or otherwise failing device could therefore leave MP4 recording active with an unexpectedly silent audio track, despite explicitly requested sound.

## Remediation

- `record/audio.rs`: maintain thread-safe shared first-failure state across audio capture workers; the mixer also checks whether any selected capture thread has unexpectedly terminated.
- `GetNextPacketSize`, `GetBuffer`, and `ReleaseBuffer` errors now terminate the source capture thread and store an explanatory error instead of emitting silent PCM.
- Non-silent packets with null audio buffers are explicitly rejected. A successful `GetBuffer` always receives `ReleaseBuffer`, even if packet contents fail validation.
- The recording worker checks requested audio health before READY, every active/paused iteration, before audio writes, and before finalization. A source failure follows existing recording error/finalize handling so incomplete recordings cannot be registered as successful gallery items.
- Legitimately silent WASAPI packets (`AUDCLNT_BUFFERFLAGS_SILENT`) are still accepted. Capturing *no sound from an idle render device* is not treated as a fault.
- Regression test injects an asynchronous device failure into the mixer health state and checks that it is propagated.
- Existing IPC boundaries, SQLite recovery, validated WASAPI formats, offline/local-first behavior, 12 locales and UI styles remain unchanged.

## Release gates and limitations

Required CI: `cargo fmt --all -- --check`, `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings`, RustSec, npm audit, strict TypeScript, localization tests, Windows Portable/NSIS/MSI build and SHA256SUMS.

**Pending physical QA:** microphone and render-loopback device unplug/replug during recording; WASAPI packet errors; MP4 successful/failed finalization; paused recording failure; AV sync on multiple devices; capture FPS at variable DPI/monitor configurations; accessibility; Windows 10/11 clean install/upgrade/uninstall; measured 1:1 reference screenshots across the entire app. CI does not prove these, so an unverified binary must remain **prerelease**.

The public snapvere.com .NET/WinUI product is not interchangeable with this Tauri/Rust repository distribution.
