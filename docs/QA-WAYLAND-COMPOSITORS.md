# Snapvere — Wayland compositor acceptance

**Status:** not yet accepted for production. Native headless Sway inventory is automated by quality.yml; no physical or interactive portal run has been recorded for this revision.

| Environment | Required verification |
| --- | --- |
| GNOME / Mutter + xdg-desktop-portal-gnome | Physical monitor mode, logical region, mixed scale, portal consent/revocation, HUD placement and inclusion |
| KDE Plasma / KWin + xdg-desktop-portal-kde | Same, including fractional scales and rotated/mirrored outputs |
| wlroots / Sway + xdg-desktop-portal-wlr | Same, including headless inventory test and interactive physical video stream |

For each environment and Free/Pro, record compositor, portal, PipeWire and GStreamer versions; use 100%, 125%, 150%, 175%, 200% outputs, negative origins, mismatched resolutions, hotplug and display reconfiguration. Compare actual authorized stream dimensions and known pixel-grid source against the selected physical crop. Verify that output-local redaction covers all touched pixels; visual pixelation is not secure deletion and old frames are unaffected. Test pause/resume, revoke authorization, cancel, stale selection, and failed device capture. Verify whether HUD/drawing windows can actually be placed and excluded from the authorized stream. If not, keep gated and design a crop-local preview/control surface instead of claiming exclusion. Capture actual installed Free/Pro screenshots and compare to branding reference on each supported resolution. Keep raw recordings local and do not upload sensitive desktop content.

Acceptance requires exact commit CI results, evidence for every test environment, no unexplained failures, and review of security risks. Headless compositor geometry alone is not end-to-end portal, annotation, privacy or hardware acceptance.
