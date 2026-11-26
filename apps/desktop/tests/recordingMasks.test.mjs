import test from "node:test";
import assert from "node:assert/strict";
import { recordingMasks } from "../src/lib/recordingMasks.ts";

const mark = (a, b, tool = "blur") => ({ id: "mark", tool, color: "#000", size: 2, points: [a, b] });

test("recording masks round outward and clip against all viewport edges", () => {
  const a = { x: 120.8, y: -3.2 };
  const b = { x: -1.5, y: 35.1 };
  assert.deepEqual(recordingMasks([mark(a, b)], 100, 50), [{ x: 0, y: 0, width: 100, height: 36 }]);
  assert.deepEqual(recordingMasks([mark(b, a)], 100, 50), recordingMasks([mark(a, b)], 100, 50));
});

test("out of viewport and zero-area masks are discarded", () => {
  assert.deepEqual(recordingMasks([
    mark({x: 110, y: 1}, {x: 120, y: 3}),
    mark({x: 4, y: 5}, {x: 4, y: 5}),
    mark({x: 0, y: 0}, {x: 10, y: 10}, "rect"),
  ], 100, 50), []);
});

test("malformed redaction and viewport inputs fail closed", () => {
  assert.throws(() => recordingMasks([mark({x: NaN, y: 2}, {x: 10, y: 10})], 100, 50));
  assert.throws(() => recordingMasks([mark({x: 1, y: 2}, undefined)], 100, 50));
  for (const width of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => recordingMasks([], width, 50));
  }
});

test("a viewport resize recomputes clipped masks from logical selections", () => {
  const marks = [mark({x: 30.2, y: 20.2}, {x: 70.7, y: 60.7})];
  assert.deepEqual(recordingMasks(marks, 100, 100), [{x: 30,y: 20,width: 41,height: 41}]);
  assert.deepEqual(recordingMasks(marks, 50, 40), [{x: 30,y: 20,width: 20,height: 20}]);
});
