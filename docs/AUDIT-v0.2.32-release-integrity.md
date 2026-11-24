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

## Experimental native Linux video backend

- A feature-gated GStreamer/OpenH264 encoder accepts the already cropped and redacted BGRA frames from the worker. It writes through an owned anonymous local file descriptor, uses monotonic timestamps, bounded raw-frame queue and EOS finalization, and publishes only a successfully finalized recording without replacement. No renderer paths, external recorder process or network source is accepted.
- The quality workflow installs distro GStreamer development/runtime plugins only for CI, runs real encoding tests and verifies the generated H.264 MP4 with ffprobe and ffmpeg decoding. This is synthetic-frame testing, not interactive desktop QA. No public packages enable linux-native-media and Linux MP4/audio capability flags remain disabled.
- PipeWire microphone and monitor source selection, audio timestamp mapping, pause/resume synchronization, portal-session permissions, plugin distribution/license review, and actual desktop acceptance are still open. Existing pipewire/ashpd dependencies are not evidence of a working audio implementation.
- Fixed the reported Linux Clippy chunks-exact lint using fixed-size slice arrays; no warning suppression.

### Follow-up: formatter and native C privacy audit

- Applied the exact rustfmt changes reported by both native runners. The MP4 encode/decode step was not reached in that run.
- Extend the first-party source privacy guard to native C adapters, including process spawning, socket APIs and external URLs. This is a source-pattern guard, not a runtime sandbox or proof of dependency behavior.

### Isolated PipeWire transport acceptance

- Added a dedicated Linux CI job with a native GStreamer PipeWire appsink probe. The test creates a private PipeWire/WirePlumber/Pulse-compatible session, a virtual sink and remapped virtual source, resolves their explicit object.serial and media.class, and feeds a generated local sine wave. It requires non-silent 48 kHz stereo S16LE samples, monotonic timestamps, bounded buffers, bounded runtime, and rejection of a missing target without default-device fallback. No microphone or physical speaker is used; no audio is saved.
- The probe is test-only, compiled outside the application package. The desktop recorder still does not enable PipeWire audio. The test is a prerequisite to integrating AAC multiplexing, device selection, stream-loss handling and pause/resume synchronization. CI results pending; no hardware acceptance claimed.

### AAC multiplexing and explicit-source pause/resume acceptance

- Native GStreamer MP4 adapter now has an optional AAC branch using voaacenc and a bounded PCM appsrc. The PCM timebase is derived from the exact accepted stereo sample count; reject malformed blocks, oversized queue stalls, missing audio, and end-of-stream A/V duration skew over 250 ms. Both streams must receive EOS before a successful finalization. Existing video-only Rust entrypoint remains unchanged.
- Isolated CI probe now feeds real PCM from each selected virtual PipeWire node into that same C muxer with synthetic video, stops input during a 1.5-second pause, restarts the same node, and requires decoded H.264/AAC output and a short duration with bounded skew. A device removal during pause must fail and remove the private test output. This is a test-only A/V clock and does not establish synchronization of live desktop frames with an actual device clock, simultaneous mixing, in-flight device loss or production UI support.
- No public Linux audio flag enabled; physical devices, production recorder routing/clock alignment, safe cancellation, output publication and native visual acceptance remain open. CI pending for this revision.

### Experimental recorder integration and simultaneous mixing

- The Rust worker now opens the AAC-enabled MP4 encoder when audio is requested, starts an explicit native PipeWire mixer, feeds bounded PCM into the same encoder after each real video frame, and drops the input graph on pause/stop. Resume reopens the same numeric node serials; no default-source fallback. The mixed output clock is based on accepted stereo sample counts and bounded against active video time; excessive backlog/lag or source discontinuity fails the recording rather than silently manufacturing audio. This is a bounded alignment strategy, not hardware-clock drift correction.
- Native GStreamer uses a single mixer pipeline for simultaneous microphone and sink monitor, with per-input buffer-health probes and fixed PCM format. Native selection currently requires explicit experimental settings.json keys linuxMicSerial and linuxMonitorSerial. No public device picker, persisted stable identity validation, or capability flag enabled. Serial values are session-specific and require fresh user selection before public use. Physical QA, source-type/identity validation, precise pause boundary and long-running drift measurements remain open.
- The isolated PipeWire job now builds and exercises the same native mixer with both virtual inputs and rejects a missing requested input. This is not evidence of independent physical signals or complete desktop A/V acceptance. CI pending.

- Latch native bus errors permanently during mixer startup; add a Rust FFI AAC/video test requiring both MP4 sample entries and no early publication. This synthetic input test complements the real PipeWire transport test.

### Live audio identity gate

- Validate selected object.serial against the live native PipeWire registry and require Audio/Source for microphone and Audio/Sink for monitoring. Require the explicit current server cookie (linuxPipeWireCookie) in the experimental settings; reject stale session identities, duplicate or missing targets, and reversed roles. Recheck after graph startup and on resume. Snapshot validation is not a proof of actual link routing during a concurrent graph change; live link monitoring and the graphical picker remain mandatory before enabling this feature publicly.
- Add isolated native tests for swapped roles and mismatched server cookie. Extend dead-code lint suppression detection to grouped attributes. Fix the exact Windows rustfmt diagnostic from the prior run. No dependency versions updated; no physical QA or visual parity claim.

### Native device discovery and graphical selection

- Native PipeWire registry lists up to 128 Audio/Source and Audio/Sink nodes using a bounded fixed-layout FFI snapshot. Device serials cross IPC as decimal strings, preventing loss of u64 precision. Settings-only asynchronous commands validate node roles and current server cookie; selected identities now live only in process memory, not in persisted settings. A restarted app requires explicit new selection. Existing public platform capabilities remain unchanged; the selectors appear only in the opt-in experimental Linux build. The public recording controls and Wayland capture remain gated; this is not a claim of end-to-end interactive recording readiness.
- Add isolated CI coverage for discovery of both virtual nodes and retain invalid identity/role tests. Correct the exact remaining rustfmt difference. Native GUI screenshots and long-running drift acceptance are still required.

- Gate discovery explicitly with a dedicated native capability bit; ordinary Windows/Linux builds do not invoke the new discovery command or render the selectors. Hide removed selections from the snapshot, without silently substituting another target. Existing public MP4/audio capability bits remain disabled on Linux.
