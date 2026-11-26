import test from "node:test";
import assert from "node:assert/strict";
import { annotationBounds, arrowGeometry, pixelationSize, validPoint } from "../src/lib/annotationGeometry.ts";

test("annotation bounds are direction independent", () => {
  const a = { x: 70, y: 12 };
  const b = { x: 10, y: 42 };
  assert.deepEqual(annotationBounds(a, b), { x: 10, y: 12, width: 60, height: 30 });
  assert.deepEqual(annotationBounds(b, a), annotationBounds(a, b));
});

test("invalid and missing points are rejected", () => {
  for (const point of [undefined, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.equal(validPoint(point), false);
  }
  assert.equal(validPoint({ x: -1, y: 0 }), true);
});

test("short and reversed arrows retain finite symmetric geometry", () => {
  const start = { x: 10, y: 0 };
  const end = { x: 0, y: 0 };
  const shape = arrowGeometry(start, end, 100);
  assert.ok(shape);
  assert.equal(shape.left.x, shape.right.x);
  assert.equal(shape.left.y, -shape.right.y);
  assert.ok(shape.shaftEnd.x >= 0 && shape.shaftEnd.x <= 10);
  assert.equal(arrowGeometry(start, start, 3), null);
  assert.equal(arrowGeometry({ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 0 }, 3), null);
});

test("pixelation allocation stays bounded for extreme dimensions", () => {
  assert.deepEqual(pixelationSize(1, 1), { width: 1, height: 1 });
  assert.deepEqual(pixelationSize(100, 50), { width: 8, height: 4 });
  assert.deepEqual(pixelationSize(Number.MAX_VALUE, Number.MAX_VALUE), { width: 1024, height: 1024 });
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(pixelationSize(value, 100), null);
    assert.equal(pixelationSize(100, value), null);
  }
});
