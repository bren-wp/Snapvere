import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const code = readFileSync(new URL("../source/popup.js", import.meta.url), "utf8");
function make(capture, space) {
  const buttons = ["visible", "area", "full", "edit"].map(mode => ({
    dataset: { action: mode }, disabled: false, handlers: {},
    addEventListener(name, cb) { this.handlers[name] = cb; }
  }));
  const node = (id) => ({ textContent: "", dataset: {} });
  const status = node("status"), note = node("note");
  const document = {
    querySelectorAll: () => buttons,
    getElementById: (id) => ({ status, note })[id],
  };
  const context = {
    console, document, browser: {},
    SnapvereCapture: { captureVisibleTab: capture },
    SnapvereWorkspace: {
      captureForEditor: space.area || (async () => "local"),
      captureFullPage: space.full || (async () => "local"),
    },
  };
  runInNewContext(code, context);
  return { buttons, status, note, click: (id) => buttons.find(b => b.dataset.action === id).handlers.click() };
}
async function tick() { await new Promise(resolve => setTimeout(resolve, 1)); }

test("visible tab saves locally, other buttons are independent", async () => {
  const popup = make(async () => ({ filename:"Snapvere/shot.png", downloadId: 2 }), {});
  popup.click("visible");
  await tick();
  assert.equal(popup.status.dataset.state, "success");
  assert.equal(popup.note.textContent, "Snapvere/shot.png");
  assert.ok(popup.buttons.every(x => x.disabled === false));
});
test("region action opens crop workflow, edit opens draw workflow", async () => {
  const modes = [];
  const popup = make(async () => undefined, {
    area: async (_api, mode) => modes.push(mode),
  });
  popup.click("area");
  await tick();
  popup.click("edit");
  await tick();
  assert.deepEqual(modes, ["crop", "draw"]);
});
test("full webpage shows actual progress and then editor status", async () => {
  const popup = make(async () => undefined, {
    full: async (_api, onProgress) => { onProgress(1, 3); onProgress(3, 3); },
  });
  popup.click("full");
  await tick();
  assert.equal(popup.status.dataset.state, "success");
  assert.match(popup.status.textContent, /private editor/);
});
test("one click in progress blocks all other capture requests", async () => {
  let release;
  let calls = 0;
  const popup = make(() => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  }, {});
  popup.click("visible");
  assert.ok(popup.buttons.every(x => x.disabled));
  popup.click("area");
  assert.equal(calls, 1);
  release({ filename:"Snapvere/shot.png", downloadId:1 });
  await tick();
  assert.ok(popup.buttons.every(x => !x.disabled));
});
test("capture failure is visible, bounded and restores actions", async () => {
  const popup = make(async () => { throw new Error("Capture denied by browser"); }, {});
  popup.click("visible");
  await tick();
  assert.equal(popup.status.dataset.state, "error");
  assert.match(popup.note.textContent, /denied/);
  assert.ok(popup.buttons.every(x => !x.disabled));
});
