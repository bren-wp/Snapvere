# SNAPVERE v0.2.18 — source-level visual corrections and verification

## Scope

Windows **Tauri/Rust** source of SNAPVERE. This work is not a visual acceptance certificate for the separately shipped WinUI/.NET product. The repo's `docs/screenshots/*.png` were produced by headless Chromium with mocked Tauri IPC and **are not original user-approved reference screenshots**. The previously supplied design references are not available as a versioned, approved pixel baseline set in this GitHub tree.

## Confirmed source defects corrected

1. **Light-mode brand tokens:** `--brand-*` custom properties were defined only in `:root`/dark theme; light theme changed only `--snapvere-*`, so borders, accent icon foreground and several surfaces retained their dark-mode values. Added a complete light token set aligned with the existing light palette.
2. **CSS override ordering:** later equal-specificity `.snapvere-app-brandbar` and `.snapvere-app-toolbar` declarations reset the earlier light backgrounds to dark. Light overrides now follow the final dark declarations.
3. **Primary-action contrast:** `.snapvere-action-card` inherited light-mode dark text inside the violet primary capture card. Its primary state now explicitly uses white foreground.
4. **Invalid color syntax:** the two `rgba(var(--snapvere-accent), ...)` expressions used a space-separated RGB custom property as if it were comma-separated. Replaced with valid `rgb(var(--snapvere-accent) / alpha)`.
5. **Cross-window theme synchronization:** an already-mounted Home/Editor/Settings WebView was not guaranteed to follow a theme choice made in another window. Listen for same-origin `storage` changes and the Tauri `snapvere:theme-changed` event; emit updates from Settings.

## Browser preview evidence added

`tools/capture_ui.py` captures and asserts:

- Home: dark, light, hovered capture action, keyboard focus and compact window; checks computed brandbar background, light brand border and white primary-action foreground.
- Settings: each of Capture, Recording, Save, Hotkeys, General, Privacy, About in light; existing dark screenshots; GIF-disabled recording audio switches; live light-to-dark theme switch reflected in an already-open Home window; 12-locale horizontal overflow check retained.
- Editor: normal dark and light states (with a **mocked** media read, not a native screenshot).
- Recording HUD: expanded colour palette and failed Stop state, preserving retry.
- Overlay: retained mock frozen RGBA frame assertions for visible/non-black pixels.

`tools/compare_ui_references.py` requires the expanded preview inventory, rejects missing approved reference PNGs, dimension mismatches and any nonzero exact RGB pixel differences. The synthetic inventory pass cannot certify native pixel parity. Motion reduction is used to limit state-transition noise during reproducible screenshots.

## Remaining acceptance work (unverified)

- User-approved original reference PNG assets for **each** screen/state/theme/locale at fixed viewport and DPI are not in the versioned GitHub tree; no exact RGB deviation score from those originals can be reported.
- Physical Windows 10 and Windows 11 with WebView2: actual font rasterization, icon sizes, DPI 100/125/150/200%, mixed-DPI multi-monitor, native dialogs, selection handles, recording overlays, installed app behaviour and screen-reader focus.
- Dark and light native captures for all controls: normal, hover, focus-visible, pressed, active, disabled, saving/loading, validation and error.
- Real native performance and control handoff: DXGI, microphone, loopback, suspend/resume, recording status, media player and file picker.

See `docs/WINDOWS-VISUAL-QA-v0.2.18.md` for the device matrix and commands. **Do not claim pixel-perfect 1:1** until identical native captures have been measured against approved baselines for every required state.
