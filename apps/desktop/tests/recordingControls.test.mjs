import test from "node:test";
import assert from "node:assert/strict";
import { runRecordingAction } from "../src/lib/recordingControls.ts";

test("a failed stop action releases the lock so a user can retry", async () => {
  const lock = { current: false };
  await assert.rejects(
    runRecordingAction(lock, () => Promise.reject(new Error("IPC unavailable"))),
    /IPC unavailable/,
  );
  assert.equal(lock.current, false);
  let calls = 0;
  assert.equal(await runRecordingAction(lock, async () => { calls++; }), true);
  assert.equal(calls, 1);
  assert.equal(lock.current, true);
});

test("parallel stop and discard requests never overlap", async () => {
  const lock = { current: false };
  let resume;
  let calls = 0;
  const first = runRecordingAction(lock, () => {
    calls++;
    return new Promise((resolve) => { resume = resolve; });
  });
  assert.equal(await runRecordingAction(lock, async () => { calls++; }), false);
  assert.equal(calls, 1);
  resume();
  assert.equal(await first, true);
  assert.equal(lock.current, true);
});

test("synchronous action exceptions also permit a retry", async () => {
  const lock = { current: false };
  await assert.rejects(
    runRecordingAction(lock, () => { throw new Error("native failure"); }),
    /native failure/,
  );
  assert.equal(lock.current, false);
});
