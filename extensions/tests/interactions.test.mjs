import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../source/background.js", import.meta.url), "utf8");

test("background shortcut performs only the requested visible-tab capture", async () => {
  let listener;
  let captured = 0;
  const context = {
    browser: { commands: { onCommand: { addListener(fn) { listener = fn; } } } },
    SnapvereCapture: { async captureVisibleTab() { captured += 1; } },
    console,
  };
  runInNewContext(source, context);
  assert.equal(typeof listener, "function");
  listener("unexpected-command");
  await Promise.resolve();
  assert.equal(captured, 0);
  listener("capture-visible-tab");
  await Promise.resolve();
  assert.equal(captured, 1);
});
