# Snapvere v0.2.32 — first stabilization cycle

Baseline: `aa7f4bd89421cef4c0bd7387e61d6ed46a4f311f`. The Git tree contains 379 entries; this is a targeted audit, not a completed review of all files.

| ID | Severity | Verified finding | Change / acceptance |
|---|---|---|---|
| REL-01 | P1 | v0.2.29–v0.2.31 are published with stable metadata although release notes identify previews; scheduled reconciliation only covers v0.2.25–27. | Enumerate paginated releases, skip drafts and pre-v0.2.25 releases; verify preview metadata by ID. Future signed production releases require an explicit reviewed policy change. |
| REL-02 | P1 | Release can publish independently of quality and screenshot workflow completion for the release revision. | Main-only release gate, exact SHA, successful push-triggered quality and frontend screenshot workflow; timeout/failure blocks downstream builds. Screenshot workflow now runs on main. |
| SEC-01 | P1 | main is not protected; protection detail endpoint returned 403. | Administrator must require quality and visual jobs in Settings > Rules > Rulesets. |
| EXP-01 | P1 | pro_batch.rs returns immediately on first export error, discarding completed count. | Implemented per-ID status, failed-only selection and native regression cases; CI pending. Full native and frontend acceptance remain open. |
| EXP-02 | P1 | Source metadata check precedes File::open; copy uses unbounded io::copy before checking byte count. | Implemented final-component no-follow/reparse checks, handle validation and bounded copying; parent directory, hard-link, cleanup and crash-safety races remain open. CI pending. |
| UPD-01 | P1 | Only version-only Windows manifest; no authenticated per-edition update chain. | Open: separate feeds, signatures, compatibility and downgrade validation. |

Frontend screenshots are not native WebView2 or WebKitGTK verification. Existing live-site comparison is non-blocking. Actual hardware QA, comprehensive dependency/security audit and branch protection remain unverified or incomplete. Do not advertise OCR, native scrolling capture or Linux MP4/audio until implemented and tested.

## Filesystem follow-up

- Linux: open each directory component with no-follow directory descriptors, pin the destination for the entire batch, and use its live procfs descriptor path. Reject multiply linked source handles. Windows: open ancestor directories without delete sharing, reject reparse attributes and query link count on the live file handle. These are mitigations, not a proof of containment on all filesystems; initial picker/open races, same-user manipulation of named staging entries, mount changes and remote filesystem semantics remain in scope.
- Stage outputs in the selected filesystem, sync before no-clobber publication. A crash may leave a partial staging filename. Directory sync is best-effort after publication; durability and power-loss testing remain open.
- New regression cases cover hard links, failed staging, Linux parent symlinks and replacement of an already pinned directory. Native CI pending for this revision.

## Anonymous Linux staging and capture geometry

- Linux uses an unnamed inode on the destination filesystem (O_TMPFILE), synced before descriptor-based no-clobber link publication. There is no temporary pathname to substitute or clean up. Destinations without O_TMPFILE or procfs publication support fail closed; compatibility with removable, network and unusual filesystems needs native testing. Windows still uses named staging; do not claim complete Windows race resistance.
- Existing xcap capture now rejects frame geometry changes rather than padding or clipping a potentially wrong redaction region. This affects the Windows fallback and Linux. No new MP4 or audio capability is claimed.
- Added lock provenance checks for registry origins and integrity metadata, including bundled npm entries. No dependency version bump. Registry checks do not replace vulnerability, license or upstream source review.
- Native acceptance: test Windows NTFS and Linux ext4/btrfs, removable/network targets, directory replacement, hard links, disk exhaustion, GNOME/KDE Wayland and X11 hotplug/scale changes, and verify all four Free/Pro editions. Linux MP4/PipeWire and portal session architecture are still open. No physical hardware tests performed.
