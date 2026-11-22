// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { mergeUniqueById, offsetAfterDeletingLoadedCapture } from "../src/lib/galleryPaging.ts";

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
