# Snapvere by Brendigo — product roadmap

Baseline: v0.2.36 unsigned Windows/Linux Free and Pro preview. v0.2.37 is a candidate, not a delivered release. Windows 10/11 x64 is primary; Linux x64 is secondary. No browser extensions, Android, iOS or macOS. English-first, 12 languages, dark default with functional light theme. Free core capability stays intact.

| Phase | Scope | Exit evidence |
|---|---|---|
| 1 — Security and release stabilization | Close native IPC, gallery filesystem identity, durable recovery, Rust/C ownership and dependency findings; update docs | Exact-revision CI, regression tests, no known unresolved release-blocking defects, physical QA separately tracked |
| 2 — Secure capture and recording | Original modular capture, DXGI, MP4/GIF encoding, session-bound recording privacy, multi-monitor/DPI, device loss, permission consent, safe recording finalization, Linux portal/audio gating | Windows 10/11 and X11/Wayland hardware matrix, interrupted recording and disk-full recovery |
| 3 — Professional media studio | Non-destructive timeline, trim/split/crop, original-safe native export, independent mic/system controls, Peak/RMS/dBFS/clipping | Real render/decode, A/V sync and quality measurements, cancellation/rollback, no fabricated meters |
| 4 — Offline multilingual OCR | Local model packaging/licensing, region extraction, language detection/selection, text copy/search, image processing | Offline multilingual corpus, resource bounds, accuracy benchmarks, no network upload |
| 5 — Smart media library | Search/index, safe metadata, saved collections, batch workflows, retention and recovery | Migration/restore tests, bounded indexing, large library and non-destructive export |
| 6 — Premium UI and web | All real English screens, reference matching, responsive/DPI layout, accessibility, shared theme, honest marketing | Physical screenshots and measured deltas, keyboard/focus, actual device testing |
| 7 — Verified production distribution | 13 exact-revision assets, SBOM, checksums, signed distribution, update-channel isolation; entitlement only if separately designed and audited | Independent package verification, install/upgrade/uninstall, signature and physical QA; unsigned builds remain previews |

The owner confirms original first-party code. Competitors are functional references only. Refactoring is driven by maintainability, safety and measured behavior, not by line similarity alone. Preserve third-party rights and prior MIT grants; see [source provenance](SOURCE-PROVENANCE.md).

Every phase: one active PR, no disabled tests, complete source/CI/audit evidence, security and dead-code review, no new modules without justified need, release only after exact revision passes. No dates promised. See [audit register](docs/AUDIT-2026-11-26.md), [QA](docs/TASK-BREAKDOWN.md) and [specification](docs/SPECIFICATION.md).
