<!-- Snapvere by Brendigo -->
<div align="center">
  <img src="site/icon.png" alt="Snapvere application icon" width="112" />

# SNAPVERE
### Capture. Edit. Share your work — on your terms.

**Screenshots, screen recordings and clear visual explanations in one Windows application.**

A product by **[Brendigo](https://brendigo.com)**.

[![Windows 10 & 11](https://img.shields.io/badge/Windows-10%20%2F%2011-17223b?style=flat-square)](https://github.com/bren-wp/Snapvere/releases/latest)
[![Local-first](https://img.shields.io/badge/Storage-Local--first-7255ea?style=flat-square)](https://snapvere.com/privacy/)
[![12 languages](https://img.shields.io/badge/Languages-12-17223b?style=flat-square)](#made-for-your-workflow)
[![License: MIT](https://img.shields.io/badge/Source-MIT-7255ea?style=flat-square)](LICENSE)

[**Website**](https://snapvere.com/) · [**Windows releases**](https://github.com/bren-wp/Snapvere/releases/latest) · [**Privacy**](https://snapvere.com/privacy/) · [**License**](legal/SNAPVERE-COMMERCIAL-EULA.txt)

<img src="site/og.png" alt="Original Snapvere brand artwork" width="860" />
</div>

---

## Your screen, clearly explained

Whether you are documenting a bug, reviewing a design or preparing a tutorial,
Snapvere gives you a simple sequence: **capture → annotate → save or copy**.

| | Feature | What you can do |
|---|---|---|
| 📸 | **Instant screenshots** | Capture a region or the full display with a shortcut or one click |
| ✏️ | **Clear annotations** | Add arrows, text, shapes and pixelation to explain a detail |
| 🎬 | **Screen recording** | Record an area or display to MP4 or silent GIF; choose cursor and audio preferences |
| ⏸️ | **Pause and resume** | Control an active recording from its toolbar or the Windows notification-area menu |
| 📋 | **Clipboard and export** | Copy a captured image or save a result in PNG, JPEG or WebP |
| 🗂️ | **Local library** | Find all captures and recordings with server-side category filters and tag search, or open the capture folder directly, without an online account |
| 🖥️ | **Ready when you are** | Launch quietly at Windows sign-in; capture from the icon beside the clock |
| 🔒 | **Privacy by design** | No automatic capture upload; locally stored captures and gallery data |

## See Snapvere in English

Explore the capture workspace, annotation editor and settings in the primary
English interface. These screenshots come from the application's actual React
components rendered with a test IPC bridge, not AI illustrations or design
mockups. They are frontend previews, not photographs or screenshots of an
installed native Windows or Linux build. Native capture and pixel-level
platform verification remain separate.

[View the latest screenshot verification runs](https://github.com/bren-wp/Snapvere/actions/workflows/screenshots.yml)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/home.png" alt="Snapvere gallery with screenshot and recording actions" /></td>
<td width="50%"><img src="docs/screenshots/editor.png" alt="Snapvere screenshot annotation editor" /></td>
</tr>
<tr><td align="center"><b>Gallery</b> — recent captures, recording and quick actions</td><td align="center"><b>Editor</b> — annotate, highlight, crop and export</td></tr>
<tr>
<td><img src="docs/screenshots/settings.png" alt="Snapvere Settings window" /></td>
<td><img src="docs/screenshots/capture-overlay.png" alt="Snapvere region selection and editing preview" /></td>
</tr>
<tr><td align="center"><b>Settings</b> — simple controls for your workflow</td><td align="center"><b>Capture</b> — select what belongs in your screenshot</td></tr>
</table>

<details>
<summary><b>🖼️ Explore more English interface screenshots</b></summary>

<img src="docs/screenshots/home-compact.png" alt="Snapvere compact gallery layout" width="760" />

<table>
<tr><td width="50%"><img src="docs/screenshots/settings-hotkeys.png" alt="Keyboard shortcuts"/></td><td width="50%"><img src="docs/screenshots/settings-capture.png" alt="Screenshot preferences"/></td></tr>
<tr><td><img src="docs/screenshots/settings-recording.png" alt="Video recording preferences"/></td><td><img src="docs/screenshots/settings-save.png" alt="Local saving preferences"/></td></tr>
<tr><td><img src="docs/screenshots/settings-privacy.png" alt="Privacy settings"/></td><td><img src="docs/screenshots/settings-about.png" alt="About and version information"/></td></tr>
</table>
</details>

## Made for your workflow

**Always available.** Snapvere starts minimized in the Windows notification
area after sign-in by default. The icon remains while the application runs;
closing the gallery simply hides the window. Open the icon menu to take a
screenshot, record an area, pause or resume a recording, **open the captures
folder directly**, change settings or quit. Windows manages whether the icon appears directly beside the clock or
in the hidden-icons menu. You can disable automatic startup in
**Settings → General → Launch on startup**.

**Fast shortcuts.** Use `PrintScreen` for region capture when the shortcut is
available. Recording shortcuts can be customized. Windows Snipping Tool and
other screenshot applications may reserve certain keys; Snapvere displays
which shortcut was actually registered.

**Local-first organization.** Images, recordings and gallery metadata stay
on your computer unless you deliberately export or share them. Snapvere
needs neither an account nor a cloud subscription for basic captures.
An optional update check retrieves version information only.

**12 interface languages.** English, Hrvatski, Deutsch, Español, Français,
Italiano, Português, Nederlands, Polski, Čeština, Slovenčina and Slovenščina.
The Windows notification-area menu follows the selected language.

## Available native packages and privacy

Snapvere v0.2.26 already has a versioned Windows x86_64 Portable/Setup/MSI
and Linux x86_64 DEB/AppImage release. Experimental Fedora/RPM packaging is
under QA in the development branch and is not a supported download yet.
The app's default mode keeps captures local, without automatic cloud uploads.
See [platform and transfer security](docs/DISTRIBUTION-PRIVACY-AND-TRANSFERS.md)
for x86/ARM64 support boundaries and the policy for any future opt-in
SFTP/cloud transfers.

## Linux preview (development)

Snapvere now shares the same **React/Tauri UI, theme and localization** on
Windows and Linux. The Linux Rust/xcap backend is being integrated with
automated Ubuntu 24.04 builds producing `Snapvere-Linux-amd64.deb` and
`Snapvere-Linux-x86_64.AppImage`. Linux previews appear with Windows
artifacts in the same versioned GitHub **prerelease only after CI succeeds**.

Current native limitations: Linux supports the shared screenshot/editor/gallery
and a silent GIF recording path in source; **MP4, system/microphone audio
recording and cursor compositing in recordings are not implemented**.
Wayland portal behavior and live-device UI 1:1 comparisons are not verified.
See [Linux acceptance checklist](docs/LINUX-PREVIEW-QA-2026-11-22.md).

## Download for Windows

Get the **Tauri/Rust Windows edition** from
[**GitHub Releases**](https://github.com/bren-wp/Snapvere/releases/latest).
The release assets contain:

| Package | Purpose |
|---|---|
| **Snapvere-Portable.exe** | Launch without an application installer |
| **Snapvere-Setup.exe** | Guided Windows setup |
| **Snapvere-Setup.msi** | Windows Installer package |
| **SHA256SUMS.txt** | Checksum list for package verification |

Snapvere is intended for 64-bit Windows 10 and Windows 11 with Microsoft
WebView2 Runtime available. The repository's GitHub packages and the
separately maintained WinUI/.NET downloads at snapvere.com are **different
editions**; do not interchange their installation and update channels.

Verify the file you downloaded:

```powershell
Get-FileHash .\Snapvere-Portable.exe -Algorithm SHA256
```

Compare that SHA-256 with the manifest from the **same release**.
The available installer packages are not presented as publisher-code-signed;
a matching checksum does not independently establish publisher identity.

## Privacy, licenses and documentation

Snapvere is built around local capture and local storage. Screen content is
not automatically sent to a server. Microphone and system audio are options
for user-initiated recordings. Users remain responsible for obtaining any
required recording permissions and protecting saved sensitive content.

The source code distributed under [MIT](LICENSE) retains its open-source
rights. The Windows installer also includes a
[commercial end-user agreement](legal/SNAPVERE-COMMERCIAL-EULA.txt) for that
distribution; it does not withdraw rights already granted by MIT or the
licenses of third-party components. Brendigo's trademarks and artwork retain
their applicable protections.

For setup tips and product information:
[Windows startup and tray](docs/STARTUP-AND-TRAY.md) ·
[Changelog](CHANGELOG.md) ·
[Language guide](docs/LOCALIZATION.md) ·
[Technical specifications](docs/SPECIFICATION.md) ·
[Security and quality review](docs/AUDIT-v0.2.22-startup.md)

---

<div align="center">

**SNAPVERE by BRENDIGO**

*Capture what matters. Keep it yours.*

[Website](https://snapvere.com/) · [Releases](https://github.com/bren-wp/Snapvere/releases/latest) · [Privacy](https://snapvere.com/privacy/)

</div>
