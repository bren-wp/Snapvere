# Snapvere — Lightshot/ShareX competitive product requirements

Product goal: an exceptionally fast and accessible Free screenshot experience, with a materially distinct privacy-first Pro productivity studio. Evaluate each behavior against the cited product documentation and real physical-device tests, **not** subjective claims that one product is universally better.

Competitor references (reviewed 2026-11-23):
- Lightshot official Croatian page: https://app.prntscr.com/hr/
- Lightshot official guide: https://app.prntscr.com/en/learnmore.html
- Lightshot hotkeys: https://app.prntscr.com/en/hotkeys.html
- ShareX: https://getsharex.com/

## Real competitive baseline

| Capability | Lightshot baseline | Snapvere Free | Snapvere Pro |
|---|---|---|---|
| Select region rapidly | Two-click region capture | Region capture and configured PrintScreen hotkey; measure actual latency | Same fast capture, plus productive post-capture workflows |
| Annotate instantly | Basic annotations and web editor | Local annotation editor, blur, shapes, text and step labels | Shared editor, separately branded Pro shell; premium editing tools remain a future milestone |
| Copy/save | Clipboard and local save | Clipboard, local formats and gallery | Same, plus native-gated local batch export |
| Remote short-link sharing | Upload to Lightshot and obtain link | **Not implemented**; no silent uploads | **Not implemented**; privacy-first by default |
| Find similar images | Supported in Lightshot | **Not implemented** | **Not implemented** |
| Professional video workflows | Not Lightshot's focus | GIF plus Windows MP4 where supported; Linux has silent GIF | Eight presets, six private saved profiles and distinct Pro Studio |
| Organize and export batches | No claimed equivalent here | Search, tags and gallery | Up to 100 selected items, type filters, reverse selection, last-24-hours and tagged quick selects |
| OCR / text extraction | Not claimed by either edition | **Not implemented** | **Not implemented** |
| Scrolling capture | Not claimed as implemented | **Not implemented** | **Not implemented** |

A Lightshot-style upload is **not** implemented by adding an unrelated third-party network service. It would require explicit opt-in, an audited provider, encryption, access expiration/revocation, and a verified privacy model. Do not promise it in marketing before it works.

## Product acceptance criteria

1. **Free usability and speed:** PrintScreen/region capture must be usable without an account, never show Pro upsell during a capture, preserve clipboard/save/editor workflow, and be benchmarked on a representative Windows system. Track capture-to-editor latency, keyboard navigation, image fidelity and cold start.
2. **Pro separation:** Pro uses a distinct signed-in-future (currently unsigned) application identifier, dedicated build-time native feature, persistent profile slots, Pro Studio shell in Home/Editor/Settings, and batch/gallery productivity tools. Free must not accept native Pro batch export commands even if its renderer is tampered with.
3. **Professional presets:** 8 explicit workflows; validate quality, frame rate, format and audio constraints for each. Linux must silently disable unsupported MP4/audio/cursor options, but label the limitation honestly.
4. **Gallery intelligence:** All batch selections operate on *loaded, visible* gallery items, respect 100-item ceiling and never mutate input sets. Time filtering uses Unix milliseconds and excludes future-dated or nonfinite entries. Tags are user-local only.
5. **Export integrity:** Files are copied by the native backend through a user-selected local directory, cannot overwrite existing files, reject symlink sources and oversized files; failed exports must never corrupt original captures. No implicit uploads or destructive cleanup.
6. **Security and supply chain:** Block release on TypeScript tests, strict Rust Clippy with Pro feature, dependency audits, cross-platform packaging checks, EULA, package naming, SBOM and SHA-256 manifest.
7. **Release delivery:** For each approved version publish Free and Pro Windows portable, NSIS and MSI, plus Linux DEB and AppImage, only after passing CI. A draft with assets is not a published release. Never claim signed/stable builds or successful device QA without the evidence.

## Next high-value Pro roadmap (not yet delivered)

- Batch metadata reports and deterministic local naming templates.
- Editable branded screenshot/export templates and reusable redaction profiles.
- Scrolling capture with reliable handling of fixed elements and dynamic content.
- On-device/offline OCR with audited language resources and explicit privacy controls.
- Project workspaces, flexible tagging rules and safe non-destructive bulk transforms.
- Real-time quality diagnostics, export history and reproducible output validation.
- Optional user-controlled private sharing with explicit deletion/expiration and no default upload.

Quality goal: benchmark against Lightshot for responsiveness and against ShareX/Snagit for power workflows; target measurable improvements, do not claim superiority until the corresponding behaviors and test evidence exist.
