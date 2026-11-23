// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { galleryKeyboardShortcut } from "../src/lib/galleryKeyboard.ts";
import {
  createGallerySelectionStore,
  galleryPreviewPaths,
  mergeUniqueById,
  offsetAfterDeletingLoadedCapture,
  splitGalleryPage,
} from "../src/lib/galleryPaging.ts";

test("append new pages without replaying an overlapping capture", () => {
  const current = [{ id: "new" }, { id: "middle" }];
  const incoming = [{ id: "middle" }, { id: "old" }];
  assert.deepEqual(mergeUniqueById(current, incoming).map((item) => item.id), [
    "new", "middle", "old",
  ]);
  assert.deepEqual(current.map((item) => item.id), ["new", "middle"]);
});

test("deduplicates duplicate IDs inside the same incoming page", () => {
  assert.deepEqual(
    mergeUniqueById([], [{ id: "one" }, { id: "one" }, { id: "two" }]),
    [{ id: "one" }, { id: "two" }],
  );
});

test("deleting a loaded capture adjusts the next SQL OFFSET without skipping older media", () => {
  const loaded = [{ id: "latest" }, { id: "middle" }, { id: "older" }];
  assert.equal(offsetAfterDeletingLoadedCapture(loaded, "middle", 3), 2);
  assert.equal(offsetAfterDeletingLoadedCapture(loaded, "missing", 3), 3);
  assert.equal(offsetAfterDeletingLoadedCapture(loaded, "latest", 0), 0);
  assert.deepEqual(loaded.map((item) => item.id), ["latest", "middle", "older"]);
});

test("look-ahead pagination shows Load more only when an older row exists", () => {
  const exactlyFull = Array.from({ length: 120 }, (_, id) => ({ id }));
  const first = splitGalleryPage([...exactlyFull, { id: 120 }], 120);
  assert.equal(first.page.length, 120);
  assert.equal(first.hasMore, true);
  assert.equal(first.page[119].id, 119);
  assert.equal(splitGalleryPage(exactlyFull, 120).hasMore, false);
  assert.equal(splitGalleryPage(exactlyFull.slice(0, 15), 120).hasMore, false);
  assert.throws(() => splitGalleryPage(exactlyFull, 0));
  assert.throws(() => splitGalleryPage(exactlyFull, 1.5));
});

test("delayed clipboard and recording callbacks use the latest gallery selection", () => {
  const selection = createGallerySelectionStore();
  const oldSnapshot = selection.snapshot();
  // Simulate a callback created before the user changed the filter.
  const delayedRefreshSelection = () => selection.snapshot();
  selection.setFilter("videos");
  selection.setQuery("meeting");
  assert.deepEqual(delayedRefreshSelection(), { query: "meeting", filter: "videos" });
  assert.deepEqual(oldSnapshot, { query: "", filter: "all" });
  selection.setFilter("images");
  assert.deepEqual(delayedRefreshSelection(), { query: "meeting", filter: "images" });
});

test("Home keyboard shortcuts avoid browser and editor modifier conflicts", () => {
  const get = (key, ctrl = false, meta = false, alt = false, shift = false) =>
    galleryKeyboardShortcut(key, ctrl, meta, alt, shift);
  assert.equal(get("F5"), "refresh");
  assert.equal(get("f", true), "search");
  assert.equal(get("F", false, true), "search");
  assert.equal(get("F5", true), null);
  assert.equal(get("F5", false, true), null);
  assert.equal(get("f", true, false, true), null);
  assert.equal(get("f", true, false, false, true), null);
  assert.equal(get("f"), null);
  assert.equal(get("F5", false, false, false, true), null);
});

test("Home intercepts gallery keyboard shortcuts before card controls stop bubbling", () => {
  const home = readFileSync(new URL("../src/windows/Home.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../src/components/home/CaptureCard.tsx", import.meta.url), "utf8");
  assert.match(card, /onKeyDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(home, /window\.addEventListener\("keydown", onShortcut, true\)/);
  assert.match(home, /window\.removeEventListener\("keydown", onShortcut, true\)/);
  assert.match(home, /aria-keyshortcuts="Control\+F Meta\+F"/);
  assert.match(home, /aria-keyshortcuts="F5"/);
});

test("gallery thumbnails fall back only to registered still-image originals", () => {
  assert.deepEqual(galleryPreviewPaths("thumb.png", "shot.png", false), ["thumb.png", "shot.png"]);
  assert.deepEqual(galleryPreviewPaths("shot.png", "shot.png", false), ["shot.png"]);
  assert.deepEqual(galleryPreviewPaths(null, "shot.png", false), ["shot.png"]);
  assert.deepEqual(galleryPreviewPaths(" ", "shot.png", false), ["shot.png"]);
  assert.deepEqual(galleryPreviewPaths("poster.png", "recording.mp4", true), ["poster.png"]);
  assert.deepEqual(galleryPreviewPaths(null, "recording.gif", true), []);
});
