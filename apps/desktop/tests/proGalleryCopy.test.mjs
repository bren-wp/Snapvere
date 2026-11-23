// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { proGalleryCopy } from "../src/lib/proGalleryCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";
import { PRO_BATCH_LIMIT, PRO_LARGE_FILE_BYTES, incompatibleProImageIds, removeIncompatibleProImages, retainLoadedProSelection, selectProBatch, summarizeProSelection } from "../src/lib/proSelection.ts";
import { summarizeProGallery } from "../src/lib/proInsights.ts";

test("Pro gallery selection/exports have complete translations", () => {
  assert.equal(LANGUAGES.length, 12);
  for (const { code } of LANGUAGES) {
    const copy = proGalleryCopy(code);
    for (const key of ["select","done","selectLoaded","clear","export","exporting","selected","failed","limit","imagesOnly","videosOnly","invert","studioTitle","studioSubtitle","profiles","batchTools","recent","tagged","insightsTitle","insightsImages","insightsVideos","insightsTagged","insightsSize","advancedSelection","lastWeek","largeFiles","untagged","hiddenSelection","keepLoaded","loadedSelectionSize","exportPreset","originalPreset","pngPreset","png1280Preset","webp1920Preset","imagePresetHelp","incompatibleImages","removeIncompatible"]) {
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

test("Pro gallery insights handle mixed media, invalid sizes and private tags locally", () => {
  const captures = [
    { id: "a", source: "region", format: "png", sizeBytes: 256, tags: ["work"] },
    { id: "b", source: "recording", format: "gif", sizeBytes: 768, tags: [""] },
    { id: "c", source: "recording", format: "mp4", sizeBytes: Number.NaN, tags: [] },
    { id: "d", source: "fullscreen", format: "jpg", sizeBytes: -1, tags: [" project "] },
  ];
  const summary = summarizeProGallery(captures);
  assert.deepEqual(summary, { count: 4, images: 2, recordings: 2, tagged: 2, sizeBytes: 1024 });
  assert.deepEqual(summarizeProGallery([]), { count: 0, images: 0, recordings: 0, tagged: 0, sizeBytes: 0 });
});

test("Pro advanced selectors handle age, size and missing tags", () => {
  const now = 1_800_000_000_000;
  const items = [
    {id:"week",createdAt:now-6*86400000,sizeBytes:PRO_LARGE_FILE_BYTES,tags:["work"]},
    {id:"boundary",createdAt:now-7*86400000,sizeBytes:PRO_LARGE_FILE_BYTES-1,tags:[" "]},
    {id:"future",createdAt:now+1,sizeBytes:Infinity,tags:[]},
    {id:"invalid",createdAt:NaN,sizeBytes:-1,tags:null},
  ];
  assert.deepEqual([...selectProBatch(new Set(),items,"week",now)],["week"]);
  assert.deepEqual([...selectProBatch(new Set(),items,"large",now)],["week"]);
  assert.deepEqual([...selectProBatch(new Set(),items,"untagged",now)],["boundary","future","invalid"]);
});

test("Full batch inversion releases old visible slots before adding replacements", () => {
  const hidden = Array.from({length:99},(_,i)=>"hidden-"+i);
  const previous = new Set([...hidden,"old"]);
  const visible = [{id:"new"},{id:"old"},{id:"new"}];
  const next = selectProBatch(previous,visible,"invert");
  assert.deepEqual([...next],[...hidden,"new"]);
  assert.equal(previous.size,100);
  assert.ok(previous.has("old"));
});

test("Pro selection exposes hidden IDs and counts unique loaded bytes only", () => {
  const selected = new Set(["a","b","outside"]);
  const visible = [{id:"a",sizeBytes:256},{id:"a",sizeBytes:256},{id:"b",sizeBytes:NaN},{id:"other",sizeBytes:1024}];
  assert.deepEqual(summarizeProSelection(selected,visible),{loaded:2,hidden:1,sizeBytes:256});
  assert.deepEqual([...retainLoadedProSelection(selected,visible)],["a","b"]);
  assert.equal(selected.size,3);
  assert.deepEqual(summarizeProSelection(new Set(["a","b"]),[{id:"a",sizeBytes:Number.MAX_SAFE_INTEGER},{id:"b",sizeBytes:10}]),{loaded:2,hidden:0,sizeBytes:Number.MAX_SAFE_INTEGER});
});

test("Pro image preset feedback rejects known incompatible selections without dropping hidden IDs", () => {
  const selected = new Set(["png","jpeg","webp","video","gif","unknown","hidden"]);
  const visible = [
    {id:"png",source:"region",format:"png"},
    {id:"jpeg",source:"clipboard",format:"jpeg"},
    {id:"webp",source:"region",format:"webp"},
    {id:"video",source:"recording",format:"png"},
    {id:"gif",source:"recording",format:"gif"},
    {id:"unknown",source:"region",format:"bmp"},
    {id:"unselected",source:"recording",format:"mp4"},
    {id:"video",source:"recording",format:"png"},
  ];
  assert.deepEqual([...incompatibleProImageIds(selected, visible)], ["video","gif","unknown"]);
  assert.deepEqual([...removeIncompatibleProImages(selected, visible)], ["png","jpeg","webp","hidden"]);
  assert.equal(selected.size, 7);
  assert.deepEqual([...removeIncompatibleProImages(selected, [])], [...selected]);
});
