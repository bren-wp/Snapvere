# SNAPVERE browser screenshot → Windows gallery (local clipboard bridge)

**Scope:** browser extension v0.2.0 and Tauri/Rust desktop. This integration is explicitly user-initiated, not unattended native messaging or a network server.

## How to use

1. Open any SNAPVERE extension toolbar menu and choose **Select area & crop**, **Edit visible tab** or **Full webpage**.
2. Make any edits locally, then click **Copy for Windows app**.
3. Open the SNAPVERE Windows application and click **Import from clipboard** in the gallery toolbar.
4. The Windows program checks the image and saves its own PNG plus thumbnail and gallery database entry. The source appears as `clipboard` rather than pretending the image was captured by DXGI.

**Fallback:** If browser clipboard image writing is unavailable, choose **Save PNG** instead and handle the downloaded file manually. This implementation does **not** read arbitrary browser files or run executables.

## Privacy and permission boundaries

- The extension has `activeTab` and `scripting` only for user-triggered capture; `clipboardWrite` writes PNG data when the user explicitly clicks. It has no `clipboardRead`, nativeMessaging host, all-sites permission or upload feature.
- The native Tauri command `import_clipboard_image` runs **only** when called by the `home` WebView. It does not poll the OS clipboard. The clipboard operation is executed in `spawn_blocking`, not on the GUI thread.
- Reject images with zero size, invalid RGBA lengths, or dimensions larger than 28,000,000 pixels. The existing gallery save function creates a unique file path, writes the PNG, generates a thumbnail and indexes it in SQLite. If indexing fails, existing gallery cleanup applies.
- Clipboard content can be visible to other apps on the same machine. Do not copy confidential screenshots on an untrusted computer; use **Save PNG** if you do not want to modify the clipboard.
- No local HTTP API, network service, secret token, remote pairing or auto-import is added.

## Testing and release requirements

`cargo test --locked`, strict Clippy, RustSec and CI run the dimensions and caller-isolation regressions. Frontend unit tests ensure all 12 languages have a localized action and error state. Playwright UI snapshots provide only browser-rendered layout evidence.

**Unverified until device test:** real Windows 10/11 clipboard PNG compatibility from Chrome, Edge, Brave, Opera, Vivaldi and Firefox, browser ClipboardItem API behavior, mixed-DPI images, multi-monitor capture, and gallery UI refresh. Safari has additional macOS signing requirements and cannot directly pair with the Windows app on a Mac without deliberately sharing its clipboard through the OS.
