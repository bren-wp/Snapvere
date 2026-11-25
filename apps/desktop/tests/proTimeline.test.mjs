// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { setReviewBoundary, validReviewRange, reviewLoopTarget } from "../src/lib/proTimeline.ts";
import { proTimelineCopy } from "../src/lib/proTimelineCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";

test("review bounds remain ordered, finite and inside actual media", () => {
  const start = setReviewBoundary(null, "start", 2, 10);
  assert.deepEqual(start, { start: 2, end: 10 });
  const range = setReviewBoundary(start, "end", 7, 10);
  assert.deepEqual(range, { start: 2, end: 7 });
  assert.deepEqual(setReviewBoundary(range, "end", 1, 10), range);
  assert.equal(setReviewBoundary(range, "start", NaN, 10), null);
  assert.equal(validReviewRange(range, 6), false);
  assert.equal(validReviewRange({ start: 0, end: Infinity }, 10), false);
});
test("loop targets only valid enabled ranges and never mutates source", () => {
  const range = { start: 2, end: 7 };
  assert.equal(reviewLoopTarget(range, true, 7, 10), 2);
  assert.equal(reviewLoopTarget(range, true, 1, 10), 2);
  assert.equal(reviewLoopTarget(range, true, 3, 10), null);
  assert.equal(reviewLoopTarget(range, false, 9, 10), null);
  assert.equal(reviewLoopTarget(range, true, 7, 6), null);
  assert.deepEqual(range, { start: 2, end: 7 });
});
test("all supported languages contain segment review copy", () => {
  assert.equal(LANGUAGES.length, 12);
  for (const { code } of LANGUAGES) {
    const copy = proTimelineCopy(code);
    assert.equal(copy.length, 6);
    assert.ok(copy.every(value => value.trim().length > 0));
  }
});
