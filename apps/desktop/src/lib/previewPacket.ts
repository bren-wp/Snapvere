// Snapvere by Brendigo
/** Strict latest-frame packet decoding. No allocation based on untrusted dimensions. */
type FrameIdentity = {
  width: number;
  height: number;
  frameId: number;
  timestamp100ns: number;
  revision: number;
};

export function decodePreviewPacket(packet: ArrayBuffer, expected: FrameIdentity): Uint8ClampedArray {
  const { width, height, frameId, timestamp100ns, revision } = expected;
  if (![width, height, frameId, timestamp100ns, revision].every(Number.isSafeInteger)
      || width < 1 || width > 960 || height < 1 || height > 540
      || frameId < 1 || timestamp100ns < 0 || revision < 0
      || packet.byteLength !== 32 + width * height * 4) {
    throw new Error("Invalid preview frame size");
  }
  const header = new DataView(packet);
  if (header.getUint32(0, true) !== width
      || header.getUint32(4, true) !== height
      || header.getBigUint64(8, true) !== BigInt(frameId)
      || header.getBigUint64(16, true) !== BigInt(timestamp100ns)
      || header.getBigUint64(24, true) !== BigInt(revision)) {
    throw new Error("Invalid preview frame identity");
  }
  return new Uint8ClampedArray(packet, 32);
}
