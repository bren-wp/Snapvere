# SNAPVERE v0.2.18 — dependency, security and stability work

Scope: GitHub `bren-wp/Snapvere` Tauri 2/Rust/React desktop edition, **not** the separate public WinUI/.NET build at snapvere.com.

## Dependency evidence (2026-11-18 GitHub hosted registries)

Read-only supply-chain scan: GitHub workflow run `44405713020`. Its npm report identified:
- `@tauri-apps/api` **2.12.4 → 2.12.5**
- `@tauri-apps/cli` **2.12.4 → 2.12.6**
- `lucide-react` **1.72.0 → 1.75.0**

The above updates were performed by a one-shot workflow which passed npm installation without lifecycle scripts, `npm run lint`, unit tests, build, `npm audit --audit-level=high`, brand, IPC and security checks; changes were written to the npm manifest and generated npm lockfile. The temporary updater was removed immediately afterward.

Cargo freshness report found **90** transitive/direct items with newer compatible versions; key direct entries include:
- `tauri` 2.12.5 → compatible 2.12.7
- `tauri-build` 2.7.4 → compatible 2.7.6
- `uuid` 1.29.2 → compatible 1.29.3.

A one-shot Windows updater runs `cargo update`, `cargo test --locked`, strict Clippy/Rustfmt, RustSec cargo audit and a bundled SQLite CVE regression guard **before** writing Cargo.lock. A failed test or audit must not update the PR branch. Verify the actual final Cargo.lock before claiming the updates landed.

### Explicitly incompatible direct upgrades (not automatically applied)

- `base64` 0.22.1 → 0.23.1
- `rusqlite` 0.42.0 → 0.43.0
- `windows` 0.60.0 → 0.62.2

These cross current dependency constraints (not proven drop-in migrations). Do not present the app as fully upgraded to every registry's latest version until Win32 API changes, SQLite migrations, media paths and native device tests are completed.

## Security hardening

- The old feature/v0.2.9-only updater ran with repository write permissions and could not serve the current v0.2.18 branch. It is now a **read-only** weekly / manually triggered report with `npm outdated` and `cargo outdated`, plus npm and RustSec audits.
- Dependabot creates separate reviewed, test-gated npm/Cargo/GitHub Actions PRs. The pinned patched build-time `picomatch` fork remains under provenance review; never silently replace it.
- `tools/check_dependency_policy.py` rejects mismatched app versions, elevated stale dependency updater privileges, missing audits, surprise npm-fork changes and accidental alternate Dependabot security branches.
- CI emits a CycloneDX 1.6 SBOM derived from **both** checked-in lockfiles and includes package versions/checksums, without contacting outside services during generation.
- Existing CSP restricts executable scripts to the app origin and native IPC commands are guarded by window labels; code continues to test source injection patterns, bundled SQLite security, gallery integrity and Tauri capability separation.
- The Windows native evidence collector captures only an app-owned window region, writes locally, refuses overwrites and **never automatically uploads private screen pixels**.
- Installer EXE/MSI and Portable EXE have SHA-256 checksums; they are currently unsigned. Checksums detect corruption against a trusted release manifest but **do not replace code-signing/authenticity verification**.

## Application stability and visual correctness

- `ImageStage` now computes true image fit, including scales under 10%, so very large screenshots are not forcibly cropped. Regression tests cover large, small, portrait, landscape and missing-size cases.
- Existing COM/Media Foundation error handling, WASAPI bounded buffers, multi-channel stereo mix and native recording HUD popup dimensions remain covered by Rust and Playwright regressions.
- Playwright tests cover Home/Settings at simulated DPR 100/125/150/200% in both themes; this is **not Windows DPI hardware acceptance**.
- Operator-driven `tools/windows-native-capture.ps1` captures real WebView2 HWND screenshots with OS version, DPI and SHA-256 metadata. Physical Windows 10/11 test evidence and approved original PNG comparisons are not available in this session.

## Mandatory release gate

Require full frontend+Rust+RustSec+Windows packaging CI and screenshot workflow for the final exact commit. Manual Windows 10/11 testing, media/audio hardware acceptance and original 1:1 references remain **UNVERIFIED** until genuine evidence is collected. Publish at most a clearly labeled prerelease while these conditions remain open.
