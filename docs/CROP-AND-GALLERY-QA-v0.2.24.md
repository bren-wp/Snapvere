# Snapvere by Brendigo — v0.2.24 recording safety and gallery workflow

## Frame boundary protection

The recorder consumes BGRA frames from DXGI or xcap. Previously, a crop
whose right edge crossed a source scanline could copy the first pixels of
the next scanline, because the code validated only the total source length.
The fixed crop clips **each source row** independently; missing pixels become
black, including when native frame data is truncated.

The implementation checks destination capacity and multiplication/offset
overflow before creating slices. Normal fully in-bounds crops still use a
single row-copy operation, avoiding full-frame clears on each frame.

## Gallery workflow and caller authorization

The Home gallery now offers **Open capture folder** alongside the existing
clipboard import. This calls the same native folder opener used by Settings
and the tray; no path is accepted from frontend inputs.
The command's native caller allowlist is `home` and `settings`.
The existing capability gate and a dedicated Rust test reject capture overlays,
recording HUD, and editor WebViews.

## Required validation before merge

- [ ] Windows Rust unit tests, Clippy, rustfmt, and three Windows packages
- [ ] IPC caller security regression gate, TypeScript, frontend tests
- [ ] RustSec dependency audit and browser extension security gate
- [ ] Native Windows 10/11 recorder crop at the right and bottom monitor edges
- [ ] Home/gallery small window, 125%-200% DPI, both themes, all 12 languages
- [ ] Reference-based visual difference tests before claiming 1:1 accuracy

## Filtering and pagination correctness

The library category (`All`, `Images`, `Videos`) is now passed to the
SQLite query before applying `LIMIT` and `OFFSET`. Previously, filtering
only the first 120 fetched captures could make older recordings invisible.
The native query preserves literal %, _ and backslash search behavior and
deduplicates tag matches. An unrecognized kind is rejected, with no raw SQL
interpolation. Existing code may omit the kind and receives `all`.

Regression tests cover more than 120 images followed by older MP4 and GIF
recordings, tag-only search, paging and invalid filter values.

## Redaction fail-closed behavior

If recording-frame dimensions and memory contents disagree, privacy redaction
blacks out the available buffer instead of returning without masking.
The crop helper likewise clears a truncated destination. Unit tests verify
that invalid lengths never leave old pixels or unredacted frame data visible.

## Responsive gallery action grouping

The Home toolbar keeps the two file actions (open captures folder and import
from clipboard) in one wrapping flex group. Compact viewports move the whole
group to the next row rather than leaving a lone button. The design remains
keyboard-navigable and uses the existing responsive layout and native IPC.

## Gallery deletion consistency and recovery

Deleting a currently displayed capture now adjusts the next SQL OFFSET and
invalidates in-flight list requests. This avoids skipping an older item when
the user next requests more results. The already loaded cards and viewer are
preserved, rather than resetting the whole gallery to the first page.

If the initial gallery read fails, the empty-state surface shows a persistent
error and a localized **Try again** action in all 12 interface languages.
Existing captures are not misrepresented as an empty gallery. Tests cover
offset adjustment, missing IDs, and all retry translations.
