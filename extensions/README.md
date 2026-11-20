# SNAPVERE browser extensions — v0.2.1 (development)

Seven independently installable-source WebExtensions in the repository root:

`chrome/`, `edge/`, `brave/`, `opera/`, `vivaldi/`, `firefox/`, `safari/`.

Every directory contains its own manifest and all required assets. Shared canonical source lives in `extensions/source/`, and `tools/build_browser_extensions.py` verifies that each browser copy exactly matches it. No extension runtime depends on GitHub or a remote script.

## Reliability improvements in v0.2.1

- The crop selection outline and unfinished pointer strokes remain **visual guides only**. Saved PNGs and images copied to Windows now render from the clean annotation state, without accidentally baking the dotted crop box into the screenshot.
- **Select area / Edit visible tab** also validate the original active browser tab immediately before and after capture, refusing an accidental screenshot of another tab when the user switches windows.
- Automated browser tests now verify those failure and export paths. The seven browser variants continue to share identical audited source assets.

## Features

- **Visible tab** — save a PNG to `Downloads/Snapvere/` as before.
- **Select area** — capture the current visible viewport, open the local screenshot editor with the crop tool selected, drag a rectangle and apply crop. This selects an area **on the captured image**, not a live in-page selection overlay.
- **Full webpage (bounded)** — with one explicit click, temporarily scroll the currently active web page, capture its visible sections (up to 25 frames and a 28-million-pixel canvas), stitch locally, restore the original scroll position and open the editor. No persistent host access and no network upload.
- **Edit visible tab** — open the local editor directly; supports pen, rectangle, text, crop, undo annotations, reset to original, Save PNG.
- **Send to Windows** — editor has **Copy for Windows app**, which writes the PNG to the OS clipboard on user click. In a desktop build that supports the matching **Import from clipboard** command, the user separately accepts importing it into the Snapvere gallery. This is a deliberate local handoff, **not an invisible native-message transfer**, pairing service or screenshot upload.

Full webpage capture does not attempt to solve every dynamic layout. Lazy-loading/infinite-scroll pages, scrolling inside nested elements, sticky headers, videos, cross-origin iframes, browser internal pages and changing page heights may yield repeated/stale content or a descriptive failure. The capture is cancelled when the active tab changes, dimensions exceed bounds, navigation occurs or the source page cannot be scripted. No automatic screen recording, background page surveillance or all-sites permission.

## Permissions, privacy, stability

The manifests request only `activeTab`, `downloads`, `scripting` and **write-only** `clipboardWrite` for editor-to-Windows handoff.

- `activeTab`: temporary access granted by clicking an extension action; revoked on navigation.
- `scripting`: execute bounded page-size/scroll-position functions **only in that granted tab** for Full webpage.
- `downloads`: save a PNG to the user's normal Downloads folder.
- `clipboardWrite`: copy edited PNG into the system clipboard after clicking **Copy for Windows app**. There is no clipboard read.
- Captures stay in a local extension-owned IndexedDB draft cache, with at most eight recent drafts. Drafts become inaccessible after 30 minutes and are removed when next accessed or a new capture is stored (not immediately if the browser stays idle); no capture is sent off-device. Users can close the editor without exporting.
- No `host_permissions`, native messaging, content scripts on all sites, telemetry, cookies, network fetch, clipboard reading, or automatic installer launch.
- The only website link shown in popup/editor is `https://snapvere.com/`.

## Building and verification

```sh
python tools/build_browser_extensions.py --check
python tools/check_browser_extensions.py
node --test extensions/tests/*.test.mjs
python tools/build_browser_extensions.py --build --zip-dir browser-extension-dist
```

GitHub Actions produces seven self-contained `Snapvere-<browser>-extension-0.2.0.zip` source archives and runs JS syntax, manifest, capture, geometry, popup and security checks.

Install Chrome, Edge, Brave, Opera or Vivaldi in Developer Mode using **Load unpacked** and its corresponding directory. For Firefox use `about:debugging#/runtime/this-firefox` and its `firefox/manifest.json`; production Firefox installs require Mozilla's signing/distribution rules. **Safari** requires packaging the source with Xcode/Apple Web Extension Packager into a native macOS/iOS container, signing and testing. The Safari folder is not a signed installable .app.

## Release acceptance

This version is not published in browser stores and has **no physical-browser acceptance** yet. Verify each browser's activeTab capture, full-page stitching and restricted pages, 100–200% page zoom and devicePixelRatio, tab-switch cancellation, 30-minute cache expiry, clipboard OS handoff and keyboard accessibility before store submissions.

The Windows app's global PrintScreen key is a separate feature; browser extensions cannot intercept a global key when the browser is closed. Physical device QA and design 1:1 comparisons are not claimed by synthetic CI.
