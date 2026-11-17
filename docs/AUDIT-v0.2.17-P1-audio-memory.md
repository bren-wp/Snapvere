# SNAPVERE v0.2.17 — Audio memory and data-integrity audit

**Baseline:** `main` 633d17b7e66ab96730ba7787ae1b091e6c4331a5; released v0.2.16. Windows Tauri 2/Rust edition; the separate .NET/WinUI download is not this program.

## Defects identified in source

1. A WASAPI `GetBuffer` result of arbitrarily large `frames` could allocate an oversized scratch sample buffer before queue truncation, particularly with unexpectedly large or corrupted device-driver values. The mixer itself only retained two seconds.
2. PCM16, PCM32 and float32 samples were read by typed pointer dereferences from an opaque `*const u8`. Without an alignment guarantee those reads can be undefined behavior.
3. MP4 recording's `write_audio_until` requested the entire accumulated timeline gap as one `mixer.pull(n)`. Long system suspends or stalls could cause very large allocations and long synthetic silence even though only two seconds of true audio remained queued.

## Implementation

- `record/audio.rs`: validate device packet duration before decoding and always release an acquired packet on failure.
- `record/audio.rs`: `read_unaligned` for 16/32-bit PCM and 32-bit IEEE float; 24-bit PCM remains explicitly byte-decoded.
- `record/mod.rs`: reject unrecoverable over-two-second audio backlog and convert recoverable due samples into at most 500ms PCM blocks.
- Keep the original recorder failure path: finalize native MP4 writer and do not register an incomplete recording as a successful gallery item.
- Regression tests cover accepted/rejected frame counts; intentionally unaligned PCM16/float32 byte pointers; negative/overflowed/oversized backlog.

## Validation still mandatory

- `cargo fmt --all -- --check`, `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings`, RustSec, npm/TS/frontend and IPC checks, plus Windows Portable/NSIS/MSI packaging and hashes must pass for this commit.
- Hardware Windows 10/11 real devices and WebView2: MIC+loopback including unplug, D3D/DXGI, pause/resume, long sleep/resume, MP4 A/V synchronization, high DPI/multi-monitor, install/upgrade/uninstall, screen readers and all 12 localized pixel-reference screenshots are not established by GitHub CI.
- Any release without documented physical QA should remain **prerelease**. Do not treat an existing GitHub release's stable flag as physical acceptance.

## Added functional enhancement: multichannel Windows system audio

WAVEFORMATEXTENSIBLE provides a speaker channel mask that identifies center and surround channels. The prior stereo-only decoder silently omitted every channel beyond the first two, risking missing dialogue in 5.1/7.1 recordings.

- Validate nonzero speaker-mask channel counts, then preserve front center, LFE, rear and side channels when producing the stereo PCM16 stream.
- Apply bounded gain normalization so the sum of input speakers cannot raise the stereo downmix above unity for in-range input PCM.
- Retain direct mono/stereo behavior, including the original 48 kHz resampler.
- Regression tests validate center voice, rear direction, side-right 7.1 preservation and clipping protection.
- Real speakers, format handling and subjective 5.1/7.1 listening still require physical Windows QA.
