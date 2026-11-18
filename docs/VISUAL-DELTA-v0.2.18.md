# SNAPVERE v0.2.18 — measured synthetic screenshot deltas

These are **real RGB comparisons of automated Playwright screenshot artifacts**, **not** comparisons against user-approved original PNG references or native Windows/WebView2 screenshots.

## Inputs and method

- Before UI corrections: Actions run [44392038742](https://github.com/bren-wp/Snapvere/actions/runs/44392038742), artifact `Snapvere-UI-Screenshots`.
- After UI corrections: Actions run [44396336166](https://github.com/bren-wp/Snapvere/actions/runs/44396336166), artifact `Snapvere-UI-Screenshots`.
- Compared all `docs/screenshots/*.png` names present in both archives. Same size and colour space (RGB); count pixels where any RGB channel differs by more than zero, and separately by more than 16/255.
- Dark-mode screenshots use the same 1120×740/920×650 viewport configurations where applicable. The comparison is **a source-regression indicator**, not a pixel-perfect certification; font raster timing/animations may introduce small deltas.

| Screen | Exact changed pixels | Changed % | Pixels with max RGB delta > 16 |
|---|---:|---:|---:|
| Home (1120×740) | 4,619 | 0.557% | 0 |
| Home compact (920×650) | 4,614 | 0.772% | 0 |
| Settings Capture (1120×740) | 0 | 0.000% | 0 |
| Settings Recording (1120×740) | 0 | 0.000% | 0 |
| Settings Hotkeys (1120×740) | 10 | 0.001% | 0 |
| Settings Save (1120×740) | 0 | 0.000% | 0 |
| Settings Privacy (1120×740) | 0 | 0.000% | 0 |
| Settings About (1120×740) | 6 | 0.001% | 0 |
| Settings default (1120×740) | 0 | 0.000% | 0 |
| Settings languages (1120×740) | 0 | 0.000% | 0 |
| Editor (1120×740) | 5,808 | 0.701% | 0 |
| Capture overlay (1440×900) | 0 | 0.000% | 0 |
| Website (1440×900) | 0 | 0.000% | 0 |
| Website mobile (390×844) | 0 | 0.000% | 0 |
| Download (1440×900) | 0 | 0.000% | 0 |
| Download mobile (390×844) | 0 | 0.000% | 0 |
| Privacy (1440×900) | 0 | 0.000% | 0 |
| Privacy mobile (390×844) | 0 | 0.000% | 0 |

## Newly captured states

Additional dark/light previews include Home focus/hover, Home light, light Settings tabs, Editor light, disabled GIF microphone/system-audio toggles, recording HUD palette, and Stop error. These have **no corresponding before PNG in the earlier archive**, so they cannot be assigned a before/after pixel delta. Light-mode preview fixtures are distinct from approved native PNG reference baselines.

## Interpretation and release gate

- Existing dark screenshots remained nearly identical: none of the shared screenshots had a maximum per-pixel RGB delta greater than 16 in the comparison above. **Exact changes are not zero** for Home, Editor and a few Settings views.
- Light-mode palette, brandbar and toolbar fixes are verified at the code/computed-style level and by the new light screenshots, but do **not** establish pixel equality with the user's original visual targets.
- A strict native 1:1 result requires original approved references captured at identical native Win10/11 OS, WebView2, DPI, font assets, viewport, theme, locale and interactive state. Physical hardware acceptance remains blocked without that evidence.
