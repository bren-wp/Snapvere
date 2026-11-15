# SNAPVERE v0.2.15 — P1 Windows WASAPI audit

Baseline: `main` 3c35e7eaf9ec1d09ebcdd8a4b069be01e87e0602, released v0.2.14.
This concerns the GitHub Tauri 2/Rust edition, not the separately distributed .NET/WinUI app.

## Cause

The previous source-format parser treated most unknown WASAPI format tags and GUID subtypes as PCM and returned zeros for unknown widths. A zero sample rate could cause an unbounded resampler loop. Requested audio must not start with an unsupported or malformed device format.

## Fix

- Isolated the decoder in `src-tauri/src/record/audio/format.rs`.
- Accepts only PCM and IEEE float formats with valid channel count, sampling rate, precision, block alignment, and complete extensible headers.
- Checks the format before reporting WASAPI source readiness; frees `GetMixFormat`'s COM allocation on rejection.
- Added tests for PCM16, extensible float32, zero rate, zero channels, unsupported sample widths, unexpected tags, bad block alignment, truncated headers and null pointers.
- Existing SQLite recovery, capture IPC permissions, offline design and 12 languages remain unchanged.

## Verification policy

Mandatory before merge: `cargo fmt --all -- --check`, `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings`, RustSec, TypeScript, npm audit, localization and native Windows package checks. Actual passing results must come from CI.

Physical Windows 10/11 audio input/output, device disconnects, pause/resume, sync, multi-monitor and DPI/1:1 screenshot validation cannot be asserted based on code review or CI alone. Until documented, any published build should remain a prerelease, with Portable EXE, NSIS EXE, MSI and SHA256 checksums.
