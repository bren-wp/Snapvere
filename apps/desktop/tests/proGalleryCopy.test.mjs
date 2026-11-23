// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { proGalleryCopy } from "../src/lib/proGalleryCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";
import { PRO_BATCH_LIMIT, selectProBatch } from "../src/lib/proSelection.ts";

test("Pro gallery selection/exports have complete translations", () => {
  assert.equal(LANGUAGES.length, 12);
  for (const { code } of LANGUAGES) {
    const copy = proGalleryCopy(code);
    for (const key of ["select","done","selectLoaded","clear","export","exporting","selected","failed","limit","imagesOnly","videosOnly","invert","studioTitle","studioSubtitle","profiles","batchTools","recent","tagged"]) {
      assert.ok(copy[key].trim(), code + " missing " + key);
    }
    assert.match(copy.count(3), /3 \/ 100/);
    assert.match(copy.exported(2), /2/);
  }
});

test("Pro selection actions preserve unrelated items and obey 100-item export cap", () => {
  const items = [
    {id:"one", source:"region", format:"png"},
    {id:"two", source:"recording", format:"gif"},
    {id:"three", source:"recording", format:"mp4"},
  ];
  const selected = new Set(["another"]);
  const images = selectProBatch(selected, items, "images");
  assert.deepEqual([...images].sort(), ["another","one"]);
  const videos = selectProBatch(images, items, "videos");
  assert.deepEqual([...videos].sort(), ["another","one","three","two"]);
  const inverted = selectProBatch(videos, items, "invert");
  assert.deepEqual([...inverted], ["another"]);
  assert.deepEqual([...selected], ["another"], "input selection must never be mutated");
  const full = new Set(Array.from({length: PRO_BATCH_LIMIT}, (_, i) => "existing-" + i));
  assert.equal(selectProBatch(full, items, "all").size, PRO_BATCH_LIMIT);
  const almost = new Set(Array.from({length: PRO_BATCH_LIMIT - 1}, (_, i) => "old-" + i));
  assert.equal(selectProBatch(almost, items, "all").size, PRO_BATCH_LIMIT);
});


test("Pro smart selection filters by recent captures and user tags", () => {
  const now = 1_800_000_000_000;
  const gallery = [
    { id: "recent", createdAt: now - 60_000, tags: [] },
    { id: "old", createdAt: now - 2 * 86400000, tags: ["  project alpha  "] },
    { id: "future", createdAt: now + 60000, tags: ["team"] },
    { id: "boundary", createdAt: now - 86400000, tags: [] },
    { id: "bad-date", createdAt: Number.NaN, tags: [""] },
  ];
  const recent = selectProBatch(new Set(), gallery, "recent", now);
  assert.deepEqual([...recent], ["recent"]);
  const tagged = selectProBatch(new Set(), gallery, "tagged", now);
  assert.deepEqual([...tagged], ["old", "future"]);
  assert.deepEqual([...selectProBatch(recent, gallery, "tagged", now)], ["recent","old","future"]);
});
