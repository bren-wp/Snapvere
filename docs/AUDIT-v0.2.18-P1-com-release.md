# SNAPVERE v0.2.18 — COM lifecycle and prerelease QA audit

Baseline: v0.2.17, merged main `8400d217787ff6f9f52a6bd191051f177fc32dac`. This concerns the Windows Tauri/Rust app, not the separate .NET/WinUI edition at snapvere.com.

## Confirmed source defect

Previously, `MfSession::start` continued to `MFStartup` on unexpected failed `CoInitializeEx` HRESULT values. If `MFStartup` then failed after successful COM initialization, the function returned before creating its RAII guard, leaking a per-thread COM initialization reference.

## Fix and tests

- Treat S_OK and S_FALSE as successful initializations requiring CoUninitialize.
- Permit RPC_E_CHANGED_MODE for an existing apartment without uninitializing it.
- Return explicit errors for other failed HRESULT values.
- On MFStartup failure, release only a COM reference this call owns.
- Add Windows Rust regression tests for S_OK, S_FALSE, RPC_E_CHANGED_MODE and E_FAIL.

## Release integrity

GitHub's v0.2.17 Release had `prerelease: false` despite the workflow configuring `prerelease: true`; native Windows 10/11 QA was not documented. The v0.2.18 release workflow checks published metadata and attempts to correct a stable designation using `gh release edit --prerelease`, failing on an unverified state. It cannot prevent later manual edits.

## picomatch status on 18 November 2026

GitHub withdrew GHSA-fc5q-39xc-vjpf / CVE-2026-112366 on 18 November 2026 (https://github.com/advisories/GHSA-fc5q-39xc-vjpf), following maintainer dispute. Withdrawal is not an upstream patch; official picomatch remains at 4.0.7. The SHA-512-pinned, build-only `@ryotsu/picomatch@4.0.7-a` fork and timed ReDoS tests remain in place for now. Fork supply-chain trust still requires independent review, and `npm audit --audit-level=high` is not disabled.

## Acceptance gates

Require Rust fmt, cargo test --locked, Clippy -D warnings, RustSec, npm ci/lint/unit/build/audit, localization/security/dead-code gates, and one-commit Portable EXE/Setup EXE/MSI/SHA256SUMS verification. Physical Windows 10/11 audio/video/driver, sleep/resume, installer updates, multi-monitor/DPI/accessibility and real 1:1 screenshot reference acceptance are **not established** by CI.
