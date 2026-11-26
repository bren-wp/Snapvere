import type { Annotation, PixelRect } from "./types";

/** Convert committed logical selections to outward-rounded viewport rectangles.
 * Native recording code remains responsible for physical-pixel mapping.
 */
export function recordingMasks(
  annotations: readonly Annotation[],
  width: number,
  height: number,
): PixelRect[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid recording viewport");
  }
  const masks: PixelRect[] = [];
  for (const annotation of annotations) {
    if (annotation.tool !== "blur") continue;
    const [start, end] = annotation.points;
    if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      throw new Error("Invalid recording redaction geometry");
    }
    const left = Math.max(0, Math.min(width, Math.floor(Math.min(start.x, end.x))));
    const right = Math.max(0, Math.min(width, Math.ceil(Math.max(start.x, end.x))));
    const top = Math.max(0, Math.min(height, Math.floor(Math.min(start.y, end.y))));
    const bottom = Math.max(0, Math.min(height, Math.ceil(Math.max(start.y, end.y))));
    if (right > left && bottom > top) {
      masks.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return masks;
}
