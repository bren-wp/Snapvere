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
