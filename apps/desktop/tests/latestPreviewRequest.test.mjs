// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { LatestPreviewRequest } from "../src/lib/latestPreviewRequest.ts";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("refresh bursts retain at most one active and one latest pending request", async () => {
  const queue = new LatestPreviewRequest();
  const gate = deferred();
  const started = [];
  const committed = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const request = n => queue.request(async current => {
    started.push(n);
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    if (n === 0) await gate.promise;
    if (current()) committed.push(n);
    concurrent--;
  }, () => assert.fail("unexpected request failure"));
  request(0);
  for (let i = 1; i <= 1000; i++) request(i);
  assert.deepEqual(started, [0]);
  gate.resolve();
  await tick();
  assert.deepEqual(started, [0, 1000]);
  assert.deepEqual(committed, [1000]);
  assert.equal(maxConcurrent, 1);
});

test("revocation discards pending work and rejects late results and errors", async () => {
  const queue = new LatestPreviewRequest();
  const gate = deferred();
  let called = 0;
  let errors = 0;
  queue.request(async current => {
    await gate.promise;
    if (current()) called++;
    throw new Error("late response");
  }, () => errors++);
  queue.request(async () => { called++; }, () => errors++);
  queue.invalidate();
  gate.resolve();
  await tick();
  assert.equal(called, 0);
  assert.equal(errors, 0);
  queue.request(async current => { if (current()) called++; }, () => errors++);
  await tick();
  assert.equal(called, 1);
  queue.request(async () => { throw new Error("active failure"); }, () => errors++);
  await tick();
  assert.equal(errors, 1);
});
