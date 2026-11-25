# Snapvere — Wayland compositor acceptance

**Status:** not yet accepted for production. Native headless Sway inventory is automated by quality.yml; no physical or interactive portal run has been recorded for this revision.

| Environment | Required verification |
| --- | --- |
| GNOME / Mutter + xdg-desktop-portal-gnome | Physical monitor mode, logical region, mixed scale, portal consent/revocation, HUD placement and inclusion |
| KDE Plasma / KWin + xdg-desktop-portal-kde | Same, including fractional scales and rotated/mirrored outputs |
| wlroots / Sway + xdg-desktop-portal-wlr | Same, including headless inventory test and interactive physical video stream |

For each environment and Free/Pro, record compositor, portal, PipeWire and GStreamer versions; use 100%, 125%, 150%, 175%, 200% outputs, negative origins, mismatched resolutions, hotplug and display reconfiguration. Compare actual authorized stream dimensions and known pixel-grid source against the selected physical crop. Verify that output-local redaction covers all touched pixels; visual pixelation is not secure deletion and old frames are unaffected. Test pause/resume, revoke authorization, cancel, stale selection, and failed device capture. Verify whether HUD/drawing windows can actually be placed and excluded from the authorized stream. If not, keep gated and design a crop-local preview/control surface instead of claiming exclusion. Capture actual installed Free/Pro screenshots and compare to branding reference on each supported resolution. Keep raw recordings local and do not upload sensitive desktop content.

Acceptance requires exact commit CI results, evidence for every test environment, no unexplained failures, and review of security risks. Headless compositor geometry alone is not end-to-end portal, annotation, privacy or hardware acceptance.

## Isolated real portal inclusion test

Quality CI now includes `tools/native/test_wayland_portal.sh` on Ubuntu 24.04. The harness creates a fresh private D-Bus session, virtual Sway outputs, private configuration and PipeWire graph; no host screen, user files, saved portal settings or physical audio devices are used as capture targets. It selects a test output through the actual wlr portal configured only for this disposable session. A synthetic GTK marker is independently checked on the other output, then moved to the captured output. The production portal adapter must detect the marker only after it enters the authorized output. The printed latency covers the move command through PipeWire sample arrival; this is not preview display latency. A failure (including unavailable portal metadata or driver) blocks the CI job, rather than silently accepting an unverified capture. Passing does not authorize showing an ordinary preview window during full-monitor recording. A separate output placement guarantee or supported exclusion API and real GNOME/KDE/wlroots acceptance are still required.

### Headless runner compatibility

The isolated portal inclusion job now uses Ubuntu 26.04 (distribution xdg-desktop-portal-wlr 0.8.1), not Ubuntu 24.04's 0.7.1. Upstream issue https://github.com/emersion/xdg-desktop-portal-wlr/issues/289 documents the older backend's Pixman/DMA-BUF format failure. The normal Linux package and geometry tests remain on Ubuntu 24.04. The portal harness starts the actual packaged backend in the private session with debug logs, verifies D-Bus ownership, records package versions and unmounts only its private document portal FUSE mount before cleanup. All original marker/background, exact authorization metadata and video assertions remain mandatory. The isolated Ubuntu 26.04 job passed on main commit `77507821c7af08232a6fbdda42e6f27e35526bbc` ([job 138841869759](https://github.com/bren-wp/Snapvere/actions/runs/45506179829/job/138841869759)). The log reports `SEPARATE_OUTPUT_MARKER_ABSENT` and `SAME_OUTPUT_MARKER_PRESENT 295365413`. This is isolated synthetic marker evidence, not screen-to-photon latency, physical GPU or legacy portal compatibility.
