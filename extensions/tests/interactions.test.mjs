import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const popupSource = readFileSync(new URL("../source/popup.js", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../source/background.js", import.meta.url), "utf8");

function popupHarness(captureImpl) {
  const elements = new Map();
  const make = () => ({
    disabled: false, textContent: "", dataset: {},
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
  });
  for (const id of ["capture", "status", "note"]) elements.set(id, make());
  const messages = [];
  const ctx = {
    browser: { tabs: {}, downloads: {} },
    document: { getElementById: (id) => elements.get(id) },
    SnapvereCapture: { captureVisibleTab: captureImpl },
    console: { error(...args) { messages.push(args); } },
  };
  runInNewContext(popupSource, ctx);
  return { elements, messages, click: () => elements.get("capture").listeners.get("click")() };
}

test("popup shows a local-save success message and never leaves capture disabled", async () => {
  const h = popupHarness(async () => ({
    filename: "Snapvere/Snapvere-2026-11-18T21-00-00-000Z.png",
    downloadId: 5,
  }));
  await h.click();
  assert.equal(h.elements.get("status").textContent, "Screenshot saved to Downloads.");
  assert.equal(h.elements.get("status").dataset.state, "success");
  assert.match(h.elements.get("note").textContent, /^Snapvere\/Snapvere-/);
  assert.equal(h.elements.get("capture").disabled, false);
  assert.equal(h.messages.length, 0);
});

test("capture rejection provides an accessible error without claiming success", async () => {
  const h = popupHarness(async () => { throw new Error("Permission denied"); });
  await h.click();
  assert.equal(h.elements.get("status").dataset.state, "error");
  assert.match(h.elements.get("status").textContent, /Could not save/);
  assert.equal(h.elements.get("capture").disabled, false);
  assert.equal(h.messages.length, 1);
});

test("background shortcut triggers capture only for the declared command", async () => {
  let listener;
  let captured = 0;
  const ctx = {
    browser: {
      commands: { onCommand: { addListener(fn) { listener = fn; } } },
    },
    SnapvereCapture: { async captureVisibleTab() { captured += 1; } },
    console,
  };
  runInNewContext(backgroundSource, ctx);
  assert.equal(typeof listener, "function");
  listener("other-command");
  await Promise.resolve();
  assert.equal(captured, 0);
  listener("capture-visible-tab");
  await Promise.resolve();
  assert.equal(captured, 1);
});
