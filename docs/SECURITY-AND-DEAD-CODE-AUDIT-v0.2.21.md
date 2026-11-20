# SNAPVERE v0.2.21 / WebExtensions v0.2.1 — security and dead-code review

**Scope:** Source-code and automated CI assessment of the Tauri 2/Rust Windows build, React WebViews, seven self-contained MV3 WebExtension bundles, their version-only update feed, and the combined release pipeline. This is **not** a guarantee of no vulnerabilities or a native hardware penetration test.

## Findings addressed in this iteration

| Severity | Component | Finding | Change and verification |
| --- | --- | --- | --- |
| Medium — screenshot integrity | Extension editor | Dashed crop selection and unfinished pointer previews were rasterized into exported PNG/clipboard images. | Render a separate clean canvas using committed operations, tested by `extensions/tests/editorExport.test.mjs` |
| Medium — cross-tab capture confusion | Region/editor capture | The original tab was not rechecked around `captureVisibleTab`; switching tabs could attribute another tab's pixels to the first page. | Check the original active tab before and after capture; regression tests in `workspace.test.mjs` |
| Low — misleading status | Windows update widget | Disabling automatic checking displayed "latest version" despite no successful request. | Distinct translated idle status, stale-banner cleanup, manual retry + Playwright test |
| Low — accessibility | Browser popup/editor | Fixed width and hardcoded dark colors differed from native theme and could cause narrow-layout overflow. | Responsive CSS, desktop palette exact-token audit and real Chromium layout screenshots in both OS schemes |
| Release integrity | Multi-platform packaging | The Windows release omitted the seven browser ZIPs and deployable update notice JSON. | Package all on the same release commit; inspect ZIP contents, validate manifest and include SHA-256 and SBOM for the entire set |
| Release reproducibility | Extension ZIPs | ZIP entry timestamps were inherited from the filesystem and changed across checkouts. | Fixed DOS timestamps, entry order and permissions; verify ZIP contents and metadata |

## Trust and data flows

- **Browser:** Local capture of a user-selected active tab using temporary `activeTab`; `scripting` is applied only to that tab for scroll/geometry, and `downloads` saves the PNG locally. `clipboardWrite` is used only on the user's click. There are **no persistent host permissions**, network uploads, remote scripts, cookie access, clipboard reads or native-messaging hosts.
- **Temporary state:** PNG drafts are held in extension-local IndexedDB; a maximum of eight latest items are retained, with entries older than 30 minutes deleted on subsequent use/access. This is not cryptographic erasure and does not guarantee instant deletion on an idle device.
- **Windows:** The user separately invokes `Import from clipboard`, implemented as a Home-scoped IPC command. It rejects zero/invalid RGBA data and over-28-million-pixel input, runs off the GUI thread, and uses existing gallery-storage and SQLite write paths. No automatic clipboard polling.
- **Updates:** `https://update.snapvere.com/stable.json` carries only product, semantic version, plain release notes and the fixed `https://snapvere.com/download/` address. The WebView rejects redirects, oversized streamed bodies, non-JSON and third-party links. It **never downloads or executes installers**.
- **Windows release:** npm lockfile installed without lifecycle scripts, bundled Rust dependencies lockfile checked, RustSec and npm vulnerability checks, Tauri command/window capability checks, Clippy, strict TypeScript and Windows build tests. ZIP entries and generated JSON are included in the shared checksum list.
- **Source links:** Public in-app controls point only to `snapvere.com` and its official update subdomain. Repository URLs in source metadata and developer documentation are not app UI links.

## Dead-code and audit coverage

| Domain | Automated gate | Coverage limit |
| --- | --- | --- |
| React/TypeScript | `tools/check_dead_code.mjs`, TypeScript `--noEmit` | Static imports only; dynamic behaviour may need instrumentation |
| Rust modules/commands | `tools/check_rust_modules.py`, Clippy, Tauri capability and IPC contract gates | Static module and command registration; not full runtime liveness |
| WebExtensions | `tools/audit_browser_extension_graph.py` | All seven entrypoints, referenced JS/CSS, static HTML controls, canonical source equivalence; no proof every function branch executes |
| Extension permissions/network | `tools/check_browser_extensions.py` | Manifest restrictions, known dangerous primitives and first-party URL policy; defense-in-depth, not sandbox penetration testing |
| WebExtension UI | `tools/check_extension_design_tokens.py`, `tools/check_extension_layout.py` | Token parity, viewport overflow, layout screenshots; not approved-reference pixel diffs or native Firefox/Safari testing |
| Release assets | `tools/check_extension_zip_contents.py`, SHA256SUMS and SBOM | Byte integrity and reproducibility; unsigned binaries/ZIPs lack cryptographic publisher authentication |

## Residual risks and release blockers

1. **No publisher digital signatures or signed in-app updater.** Version JSON and SHA-256 alone cannot authenticate an executable against a compromised server. Require securely generated publisher private key and code signing before enabling one-click executable installation. Keep notification-only updates meanwhile.
2. **No real Windows 10/11 physical acceptance evidence** for Print Screen conflicts, WMF/DirectX/WASAPI devices, installation/upgrade/uninstall, 100%, 125%, 150%, 200% DPI scaling or physical clipboard transfer.
3. **No browser-store or full WebExtension runtime acceptance** for Chrome, Firefox, Edge, Brave, Opera, Vivaldi and Safari. Safari needs a signed Xcode container and testing under Apple platform restrictions.
4. **No approved-reference screenshot comparison evidence** for every interactive state; matching color tokens and responsive Chromium snapshots are not pixel-perfect native parity.
5. Very long, infinite-scroll, lazy-loaded or sticky-header pages can still produce imperfect full-page stitched screenshots. Current limits (25 frames, 28 million pixels) fail safely rather than granting unlimited capture.
6. Source ZIPs are for developer/test installation, not signed browser-store submissions. The official web product may distribute a distinct WinUI/.NET edition; keep channels and version feeds separate.
7. The reviewed build dependency override of `picomatch` must stay pinned to its audited SHA-512 tarball until a proven safe upstream replacement passes security tests.

**Release rule:** Only merge after exact-commit Windows/extension unit, security, responsiveness and package CI succeed. Mark the GitHub release as a prerelease while physical Windows/browser acceptance remains incomplete. If any check fails, do not publish.
