import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const code = readFileSync(new URL("../source/workspace.js", import.meta.url), "utf8");
function workspace() {
  const context = { console, Blob, Date, Number };
  runInNewContext(code, context);
  return context.SnapvereWorkspace;
}
test("full-page stitch planning handles exact pages and final overlapping strips", () => {
  const a = workspace();
  assert.deepEqual(Array.from(a.planPageCapture(1000, 1000, 1000, 1000)), [0]);
  assert.deepEqual(Array.from(a.planPageCapture(1000, 2500, 1000, 1000)), [0, 1000, 1500]);
  assert.deepEqual(Array.from(a.planPageCapture(300, 100, 300, 900)), [0]);
  assert.deepEqual(Array.from(a.planPageCapture(1200, 3000, 1200, 750)), [0, 750, 1500, 2250]);
});
test("oversized, horizontally scrolling, noninteger and excessive page lengths fail closed", () => {
  const a = workspace();
  for (const dimensions of [
    [1000, 40000, 1000, 800],
    [1000, 20000, 900, 800],
    [3000, 20000, 3000, 800],
    [NaN, 1000, 1000, 800],
    [200.5, 1000, 200, 500],
    [1000, 1000, 0, 800],
    [1000, 1000, 1000, -10],
    [500, 19000, 500, 600],
  ]) assert.throws(() => a.planPageCapture(...dimensions));
});
test("selected area coordinates scale accurately from CSS viewport to PNG pixels", () => {
  const a = workspace();
  const result = a.areaPixels(
    { x: 10, y: 20, width: 50, height: 60 },
    { width: 300, height: 200 },
    { width: 600, height: 400 }
  );
  assert.deepEqual({ ...result }, { x:20, y:40, width:100, height:120 });
});
test("selection clamps to visible image bounds and rejects empty crops", () => {
  const a = workspace();
  const result = a.areaPixels(
    { x: -30, y: -10, width: 50, height: 50 },
    { width: 100, height: 100 },
    { width: 200, height: 200 }
  );
  assert.deepEqual({ ...result }, { x:0, y:0, width:40, height:80 });
  assert.throws(() => a.areaPixels(
    { x:100, y:20, width:10, height:20 },
    { width:100, height:100 }, { width:200, height:200 }
  ));
});
test("an unsupported active page does not silently make a screenshot", async () => {
  const a = workspace();
  await assert.rejects(a.captureFullPage({ tabs: {}, scripting: {} }), /unsupported/i);
});

function fullPageTabRace(switchOnQuery) {
  const context = {
    console, Blob, Date, Number,
    document: { createElement() { return {}; } },
    // Avoid 650ms timers in the isolated deterministic test.
    setTimeout(fn) { queueMicrotask(fn); return 1; },
    clearTimeout() {},
  };
  runInNewContext(code, context);
  let queries = 0;
  let captured = 0;
  let restored = 0;
  let editorOpened = 0;
  const api = {
    tabs: {
      async query() {
        queries += 1;
        return [{ id: queries >= switchOnQuery ? 44 : 33, windowId: 5 }];
      },
      async captureVisibleTab() { captured += 1; return "data:image/png;base64,AA=="; },
      async create() { editorOpened += 1; },
    },
    scripting: {
      async executeScript({ func, args }) {
        const name = func.name;
        if (name === "measureDocument") return [{ result: {
          width: 300, height: 200, viewportWidth: 300, viewportHeight: 200,
          originalX: 0, originalY: 15, url: "https://example.com/",
        } }];
        if (name === "moveDocument") return [{ result: {
          y: args[0], url: "https://example.com/",
        } }];
        if (name === "restoreDocument") restored += 1;
        if (name === "") return [{ result: "https://example.com/" }];
        return [{ result: null }];
      },
    },
  };
  return { run: () => context.SnapvereWorkspace.captureFullPage(api),
    stats: () => ({ queries, captured, restored, editorOpened }) };
}

test("full-page capture refuses a tab switch during compositor delay", async () => {
  // Original tab is seen by initial query and pre-scroll check. The next
  // active-tab query runs after the 650ms wait and finds a different tab.
  const flow = fullPageTabRace(3);
  await assert.rejects(flow.run(), /Active tab changed/);
  assert.equal(flow.stats().captured, 0);
  assert.equal(flow.stats().editorOpened, 0);
  assert.equal(flow.stats().restored, 1);
});

test("full-page capture discards frame if active tab changes during captureVisibleTab", async () => {
  // Tab switch occurs while browser screenshot API is processing the frame.
  const flow = fullPageTabRace(4);
  await assert.rejects(flow.run(), /Active tab changed/);
  assert.equal(flow.stats().captured, 1);
  assert.equal(flow.stats().editorOpened, 0);
  assert.equal(flow.stats().restored, 1);
});

function setupEditorTabSwitch(switchAtQuery) {
  const context = { console, Blob, Date, Number };
  runInNewContext(code, context);
  let checks = 0, screenshots = 0, drafts = 0;
  const api = {
    tabs: {
      async query() {
        checks++;
        return [{ id: checks >= switchAtQuery ? 8 : 7, windowId: 9 }];
      },
      async captureVisibleTab(windowId) {
        assert.equal(windowId, 9);
        screenshots++;
        return "data:image/png;base64,AQID";
      },
    },
  };
  const originalSave = context.SnapvereWorkspace.openEditor;
  void originalSave; // Never reached: switched tabs abort before image decoding.
  return {
    async run() { await context.SnapvereWorkspace.captureForEditor(api, "crop"); },
    stats: () => ({ checks, screenshots, drafts }),
  };
}
test("region capture refuses a tab switch before the screenshot", async () => {
  const flow = setupEditorTabSwitch(2);
  await assert.rejects(flow.run(), /Active tab changed/);
  assert.equal(flow.stats().screenshots, 0);
});
test("region capture refuses pixels if browser switched tabs while taking screenshot", async () => {
  const flow = setupEditorTabSwitch(3);
  await assert.rejects(flow.run(), /Active tab changed/);
  assert.equal(flow.stats().screenshots, 1);
});

function navigationRace(navigateAtCheck) {
  const root = { console, Blob, Date, Number };
  runInNewContext(code, root);
  let checks = 0, screenshots = 0;
  const api = {
    tabs: {
      async query() {
        checks += 1;
        return [{
          id: 19, windowId: 7,
          url: checks >= navigateAtCheck ? "https://example.com/other" : "https://example.com/start",
        }];
      },
      async captureVisibleTab() {
        screenshots += 1;
        return "data:image/png;base64,AA==";
      },
    },
  };
  return {
    run: () => root.SnapvereWorkspace.captureForEditor(api, "crop"),
    stats: () => ({ checks, screenshots }),
  };
}

test("region capture refuses same-tab navigation before taking screenshot", async () => {
  const race = navigationRace(2);
  await assert.rejects(race.run(), /navigated during capture/);
  assert.equal(race.stats().screenshots, 0);
});

test("region capture refuses same-tab navigation while acquiring pixels", async () => {
  const race = navigationRace(3);
  await assert.rejects(race.run(), /navigated during capture/);
  assert.equal(race.stats().screenshots, 1);
});

test("full-page capture never restores scroll on a navigated replacement document", async () => {
  const context = {
    console, Blob, Date, Number,
    document: { createElement() { return {}; } },
  };
  runInNewContext(code, context);
  let checks = 0, restored = 0, captured = 0;
  const api = {
    tabs: {
      async query() {
        checks += 1;
        return [{
          id: 21, windowId: 7,
          url: checks >= 2 ? "https://example.com/replacement" : "https://example.com/original",
        }];
      },
      async captureVisibleTab() { captured += 1; return "data:image/png;base64,AA=="; },
    },
    scripting: {
      async executeScript({ func }) {
        if (func.name === "measureDocument") return [{ result: {
          width: 300, height: 200, viewportWidth: 300, viewportHeight: 200,
          originalX: 0, originalY: 30, url: "https://example.com/original",
        } }];
        if (func.name === "restoreDocument") restored += 1;
        if (func.name === "") return [{ result: "https://example.com/replacement" }];
        return [{ result: null }];
      },
    },
  };
  await assert.rejects(context.SnapvereWorkspace.captureFullPage(api), /navigated during capture/);
  assert.equal(captured, 0, "Never capture pixels from a replacement page");
  assert.equal(restored, 0, "Do not rewrite the replacement page's scroll position");
});
