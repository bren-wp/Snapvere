// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { drawAnnotation } from "../src/lib/canvas.ts";

const source = { frozen: {}, originX: 0, originY: 0, scale: 1 };
const annotation = (tool, points) => ({ id: "test", tool, points, size: 3, color: "#f00" });

function recordingContext() {
  const calls = [];
  const ctx = {
    globalAlpha: 0.8, fillStyle: "#abc", imageSmoothingEnabled: true,
    save() { this.saved = { globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, imageSmoothingEnabled: this.imageSmoothingEnabled }; calls.push("save"); },
    restore() { Object.assign(this, this.saved); calls.push("restore"); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect(...rect) { calls.push({ rect, color: this.fillStyle, alpha: this.globalAlpha }); },
  };
  return { ctx, calls };
}

test("marker does not leak context styling into later rendering", () => {
  const { ctx, calls } = recordingContext();
  drawAnnotation(ctx, annotation("marker", [{x: 1, y: 1}, {x: 5, y: 6}]), source);
  assert.deepEqual(calls, ["save", "restore"]);
  assert.equal(ctx.globalAlpha, 0.8);
  assert.equal(ctx.fillStyle, "#abc");
});

test("missing and nonfinite points do not alter the context", () => {
  const { ctx, calls } = recordingContext();
  drawAnnotation(ctx, annotation("pen", []), source);
  drawAnnotation(ctx, annotation("pen", [{x: Infinity, y: 0}]), source);
  assert.deepEqual(calls, []);
});

test("tiny positive pixelation and invalid scale use opaque fallback", () => {
  const { ctx, calls } = recordingContext();
  drawAnnotation(ctx, annotation("blur", [{x: 2, y: 3}, {x: 3, y: 4}]), source);
  drawAnnotation(ctx, annotation("blur", [{x: 2, y: 3}, {x: 7, y: 8}]), {...source, scale: 0});
  assert.deepEqual(calls, [
    "save", {rect: [2,3,1,1], color: "#000", alpha: 1}, "restore",
    "save", {rect: [2,3,5,5], color: "#000", alpha: 1}, "restore",
  ]);
  assert.equal(ctx.globalAlpha, 0.8);
});

test("unavailable canvas sampling masks the area instead of silently skipping", () => {
  const { ctx, calls } = recordingContext();
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement() { return {getContext() { return null; }}; },
  } });
  try {
    drawAnnotation(ctx, annotation("blur", [{x: 2, y: 3}, {x: 7, y: 8}]), source);
    assert.deepEqual(calls, ["save", {rect: [2,3,5,5], color: "#000", alpha: 1}, "restore"]);
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else delete globalThis.document;
  }
});
