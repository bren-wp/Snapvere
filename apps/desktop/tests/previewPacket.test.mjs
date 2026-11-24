// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { decodePreviewPacket } from "../src/lib/previewPacket.ts";

const metadata = { width: 2, height: 1, frameId: 5, timestamp100ns: 400, revision: 2 };

function packet() {
  const bytes = new ArrayBuffer(40);
  const header = new DataView(bytes);
  header.setUint32(0, 2, true);
  header.setUint32(4, 1, true);
  header.setBigUint64(8, 5n, true);
  header.setBigUint64(16, 400n, true);
  header.setBigUint64(24, 2n, true);
  new Uint8Array(bytes, 32).set([0, 0, 0, 255, 255, 255, 255, 255]);
  return bytes;
}

test("decodes only exact crop-local RGBA payload", () => {
  assert.deepEqual([...decodePreviewPacket(packet(), metadata)], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test("rejects stale sequence, timestamp, revision and truncated packets", () => {
  for (const change of [{ frameId: 4 }, { timestamp100ns: 399 }, { revision: 1 }, { width: 3 }, { height: 0 }, { frameId: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => decodePreviewPacket(packet(), { ...metadata, ...change }));
  }
  assert.throws(() => decodePreviewPacket(packet().slice(0, 39), metadata));
  assert.throws(() => decodePreviewPacket(new ArrayBuffer(0), metadata));
});
