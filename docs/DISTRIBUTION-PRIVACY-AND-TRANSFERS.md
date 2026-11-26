# Snapvere distribution, offline safety and optional transfer specification

## Native releases and architectures

| Target | Release artifact | Actual status |
|---|---|---|
| Windows x86_64 (64-bit) | Portable EXE, NSIS Setup EXE, WiX MSI | CI-built in v0.2.35; real-device QA/signing incomplete |
| Linux x86_64 Debian/Ubuntu | DEB | CI-built v0.2.35; runtime QA incomplete |
| Linux x86_64 multiple distributions | AppImage | CI-built v0.2.35; glibc/WebKitGTK/Wayland constraints |
| Linux x86_64 Fedora/RPM family | RPM | **QA-only experimental build**; no published support yet |
| Windows x86 (32-bit) | none | Not compiled; needs target-specific build/test and dependencies |
| Windows ARM64 | none | Not compiled; needs ARM64 native build/test and signing |
| Linux ARM64 | none | Not compiled; needs aarch64 build/test and native distro QA |

The term "x84" is not a recognized CPU target. Common targets are 32-bit
x86/i686, 64-bit x86_64/amd64 and 64-bit ARM/aarch64. A single executable
cannot simultaneously embed all of them. Linux "portable" does not mean no
runtime dependencies. Publish clear architecture and compatibility metadata.

## Captures remain local by default

No new FTP, SFTP, WebDAV or cloud-network code is added by these changes.
The current native Save As file picker can export to a folder the **user
explicitly chooses**, including an existing locally mounted or synchronized
folder. Snapvere itself does not authenticate to or upload to that service.
A third-party sync application may upload files placed in its folder under
that application's terms; label this clearly if exposed in UI later.

A future optional transfer module should require:

1. A separate disabled-by-default per-service connection with explicit consent
   and an individual file/batch Send action; never auto-upload screenshots.
2. **SFTP** (SSH host-key verification), HTTPS with certificate validation,
   or WebDAV over HTTPS. Plain FTP must not carry passwords or private media.
3. OS-protected credential storage, no plaintext tokens in SQLite/settings,
   secure account removal, credential rotation and no logging of secrets.
4. Private destination validation, path traversal/symlink protection and
   no untrusted file overwrite; durable resumable uploads and checked integrity.
5. Local-only operation when offline, visible transfer queue, cancel/retry,
   bandwidth/rate limits, explicit deletion controls and privacy-policy updates.
6. No vendor-specific cloud registration until a real, audited hosted backend
   exists with account recovery, access control, retention and deletion policies.
7. Threat-model review and cross-platform integration QA before enabling
   network privileges in Tauri capabilities or Content Security Policy.

Direct upload and the proposed self-hosted Snapvere cloud are **not shipped**
in v0.2.26 and are not claimed available by this document.
