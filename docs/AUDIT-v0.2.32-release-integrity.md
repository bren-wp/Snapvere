# Snapvere v0.2.32 — first stabilization cycle

Baseline: `aa7f4bd89421cef4c0bd7387e61d6ed46a4f311f`. The Git tree contains 379 entries; this is a targeted audit, not a completed review of all files.

| ID | Severity | Verified finding | Change / acceptance |
|---|---|---|---|
| REL-01 | P1 | v0.2.29–v0.2.31 are published with stable metadata although release notes identify previews; scheduled reconciliation only covers v0.2.25–27. | Enumerate paginated releases, skip drafts and pre-v0.2.25 releases; verify preview metadata by ID. Future signed production releases require an explicit reviewed policy change. |
| REL-02 | P1 | Release can publish independently of quality and screenshot workflow completion for the release revision. | Main-only release gate, exact SHA, successful push-triggered quality and frontend screenshot workflow; timeout/failure blocks downstream builds. Screenshot workflow now runs on main. |
| SEC-01 | P1 | main is not protected; protection detail endpoint returned 403. | Administrator must require quality and visual jobs in Settings > Rules > Rulesets. |
| EXP-01 | P1 | pro_batch.rs returns immediately on first export error, discarding completed count. | Open: typed per-item result, retry-only failures, localization and regression tests. |
| EXP-02 | P1 | Source metadata check precedes File::open; copy uses unbounded io::copy before checking byte count. | Open: race-resistant native handles and bounded reads, Windows and Linux regression tests. |
| UPD-01 | P1 | Only version-only Windows manifest; no authenticated per-edition update chain. | Open: separate feeds, signatures, compatibility and downgrade validation. |

Frontend screenshots are not native WebView2 or WebKitGTK verification. Existing live-site comparison is non-blocking. Actual hardware QA, comprehensive dependency/security audit and branch protection remain unverified or incomplete. Do not advertise OCR, native scrolling capture or Linux MP4/audio until implemented and tested.
