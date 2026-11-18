import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const popupJs = readFileSync(new URL("../source/popup.js", import.meta.url), "utf8");

function makePopup(captureVisibleTab) {
  const nodes = new Map(
    ["capture", "status", "note"].map((id) => [id, {
      id, disabled: false, textContent: "", dataset: {}, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
    }])
  );
  const document = { getElementById: (id) => nodes.get(id) };
  const root = {
    console,
    document,
    browser: { tabs: {}, downloads: {} },
    SnapvereCapture: { captureVisibleTab },
  };
  runInNewContext(popupJs, root);
  return {
    capture: nodes.get("capture"),
    status: nodes.get("status"),
    note: nodes.get("note"),
    click() { return nodes.get("capture").listeners.click(); },
  };
}

test("successful save updates popup status and restores its capture button", async () => {
  let calls = 0;
  const popup = makePopup(async () => {
    calls += 1;
    return { filename: "Snapvere/Snapvere-2026-11-19.png", downloadId: 7 };
  });
  await popup.click();
  assert.equal(calls, 1);
  assert.equal(popup.capture.disabled, false);
  assert.equal(popup.status.dataset.state, "success");
  assert.match(popup.status.textContent, /saved to Downloads/);
  assert.equal(popup.note.textContent, "Snapvere/Snapvere-2026-11-19.png");
});

test("a double click cannot start multiple simultaneous screen captures", async () => {
  let release;
  let calls = 0;
  const popup = makePopup(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });
  const pending = popup.click();
  assert.equal(popup.capture.disabled, true);
  await popup.click();
  assert.equal(calls, 1);
  release({ filename: "Snapvere/test.png", downloadId: 1 });
  await pending;
  assert.equal(popup.capture.disabled, false);
  assert.equal(popup.status.dataset.state, "success");
});

test("protected page or failed downloads display a recoverable error", async () => {
  const popup = makePopup(async () => {
    throw new Error("A protected browser page cannot be captured");
  });
  await popup.click();
  assert.equal(popup.capture.disabled, false);
  assert.equal(popup.status.dataset.state, "error");
  assert.match(popup.status.textContent, /Could not save this tab/);
  assert.match(popup.note.textContent, /protected browser pages/);
});
