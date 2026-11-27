# Snapvere — macOS native development

Status: **Native implementation and preview validation in progress.** No macOS application package is publicly released or accepted. Windows remains the primary platform; the Windows/Linux public release inventory is unchanged.

The macOS distribution will use the same Rust/Tauri backend, React/TypeScript frontend, SQLite data model, design assets, locales and Free/Pro edition boundaries under `apps/desktop`. This directory contains platform-specific validation and will hold packaging/permission configuration as the native implementation is accepted. Do not fork the application or duplicate the UI.

## Native feasibility command

On a Mac with Xcode command-line tools, Node.js 24+ and the repository's Rust toolchain installed:

```bash
bash macOS/check-native.sh
```

This checks the shared frontend and unit suite, and compiles both editions (including test targets) for the actual Apple Silicon or Intel Rust host using the existing lockfiles. It fails on non-macOS hosts. It runs targeted descriptor-relative media-read tests in both editions, but does not certify functional parity or execute the entire native acceptance suite. The separate experimental [macOS CI workflow](../.github/workflows/macos-native.yml) runs this command on Apple Silicon and Intel for relevant pull-request changes, then builds and verifies Free and Pro DMG disk images and retains them as CI previews with SHA-256 checksums. These are not signed/notarized production distributions. It has no publishing permissions and does not change the required Windows/Linux release inventory. Run on both architectures before making a compatibility claim.

## Parity acceptance

| Area | Current evidence | Required native work |
|---|---|---|
| Shared UI, gallery, editor, themes, locales | Shared source exists | WKWebView, Retina, keyboard, accessibility and native screenshots |
| Screenshot and GIF capture | Shared xcap/GIF code exists; macOS unverified | Screen recording permission, multiple displays, window selection and actual capture tests |
| MP4, microphone, system audio | Windows-specific backend; no macOS MP4 encoder | ScreenCaptureKit / AVFoundation / CoreAudio as appropriate to supported OS versions; encode/decode and sync |
| Recording privacy and controls | Shared session model | Native exclusion, cursor, overlay positioning and frame privacy verification |
| File identity and recovery | Descriptor-relative, bounded read-only media access and native device/inode identity implemented; CI acceptance pending | Safe directory mutation, APFS durability, non-destructive journal recovery and asset-protocol race acceptance |
| Hotkeys, tray, startup, native dialogs | Shared Tauri interfaces | Command-key shortcuts, menu bar and platform permission lifecycle |
| Free/Pro and licensing | Shared feature flag | Native edition enforcement and entitlement acceptance |
| Delivery | CI configured to build Free/Pro DMG previews for Apple Silicon and Intel; acceptance pending | Verified app launch, signing/notarization or explicit unsigned distribution policy, Gatekeeper and package lifecycle tests |

CI preview package names (public names only after acceptance): Snapvere-macOS-arm64.dmg, Snapvere-macOS-x64.dmg, Snapvere-Pro-macOS-arm64.dmg, Snapvere-Pro-macOS-x64.dmg, with separate verified checksum/SBOM inventory. These names describe intended CI artifacts, not available public downloads. Minimum OS remains to be determined from the accepted capture/audio backend; the current Tauri minimum of 12.0 does not establish support. No signing secrets belong in Git. No macOS advertisement or update-channel activation before native verification.
