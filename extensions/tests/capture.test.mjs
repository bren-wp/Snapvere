import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const code = readFileSync(new URL("../source/capture.js", import.meta.url), "utf8");
function load() {
  const ctx = { console };
  runInNewContext(code, ctx);
  return ctx.SnapvereCapture;
}

test("download a captured tab locally without reading page URLs or network requests", async () => {
  const caller = load();
  const records = [];
  const api = {
    tabs: {
      async query(filter) {
        records.push(["query", filter]);
        return [{id: 9, windowId: 18, url: "https://example.test/"}];
      },
      captureVisibleTab: async (windowId, options) => {
        records.push(["capture", windowId, options.format]);
        return "data:image/png;base64,AA==";
      },
    },
    downloads: { download: async (args) => {
      records.push(["download", args.filename, args.url, args.conflictAction, args.saveAs]);
      return 7;
    } },
  };
  const out = await caller.captureVisibleTab(api);
  assert.match(out.filename, /^Snapvere\/Snapvere-20\d\d-.*\.png$/);
  assert.equal(out.downloadId, 7);
  assert.deepEqual(records[0][0], "query");
  assert.deepEqual(records[2], ["capture", 18, "png"]);
  assert.equal(records[4][1], out.filename);
  assert.equal(records[4][2], "data:image/png;base64,AA==");
  assert.deepEqual(records[4].slice(3), ["uniquify", false]);
});

test("capture rejects malformed image data and does not download it", async () => {
  const caller = load();
  let downloaded = false;
  const api = {
    tabs: {
      query: async () => [{id: 3, windowId: 5}],
      captureVisibleTab: async () => "https://example.invalid/pixel.png",
    },
    downloads: { download: async () => { downloaded = true; return 3; } },
  };
  await assert.rejects(caller.captureVisibleTab(api), /PNG/);
  assert.equal(downloaded, false);
});

test("download and API failures propagate for honest UI errors", async () => {
  const caller = load();
  await assert.rejects(caller.captureVisibleTab({tabs: {}, downloads: {}}), /does not support/);
  await assert.rejects(caller.captureVisibleTab({
    tabs: {
      query: async () => [{id: 3, windowId: 5}],
      captureVisibleTab: async () => "data:image/png;base64,AA==",
    },
    downloads: { download: async () => undefined },
  }), /did not confirm/);
});

test("filenames do not include URLs, tab titles or forbidden filesystem characters", () => {
  const caller = load();
  const filename = caller.filename(new Date("2026-11-18T21:41:20.213Z"));
  assert.equal(filename, "Snapvere/Snapvere-2026-11-18T21-41-20-213Z.png");
  assert.doesNotMatch(filename, /[:<>|?*]/);
});

test("visible-tab download refuses active-tab switches before capture", async () => {
  const caller = load();
  let calls = 0, captures = 0, downloads = 0;
  const api = {
    tabs: {
      async query() {
        calls++;
        return [{ id: calls >= 2 ? 6 : 5, windowId: 11 }];
      },
      async captureVisibleTab() { captures++; return "data:image/png;base64,AA=="; },
    },
    downloads: { async download() { downloads++; return 1; } },
  };
  await assert.rejects(caller.captureVisibleTab(api), /Active tab changed/);
  assert.equal(captures, 0);
  assert.equal(downloads, 0);
});

test("visible-tab download refuses same-tab URL navigation during image capture", async () => {
  const caller = load();
  let calls = 0, captures = 0, downloads = 0;
  const api = {
    tabs: {
      async query() {
        calls++;
        return [{
          id: 5, windowId: 11,
          url: calls >= 3 ? "https://example.test/other" : "https://example.test/start",
        }];
      },
      async captureVisibleTab(windowId) {
        assert.equal(windowId, 11);
        captures++;
        return "data:image/png;base64,AA==";
      },
    },
    downloads: { async download() { downloads++; return 1; } },
  };
  await assert.rejects(caller.captureVisibleTab(api), /navigated/);
  assert.equal(captures, 1);
  assert.equal(downloads, 0, "Never save another page's pixels to Downloads");
});
