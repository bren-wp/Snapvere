// Snapvere by Brendigo
// Read-only summary of the currently loaded gallery page. Never scan disk or upload data.
import { isVideo, type Screenshot } from "./types.ts";

export interface ProGalleryInsights {
  count: number;
  images: number;
  recordings: number;
  tagged: number;
  sizeBytes: number;
}

export function summarizeProGallery(items: readonly Screenshot[]): ProGalleryInsights {
  let images = 0;
  let recordings = 0;
  let tagged = 0;
  let sizeBytes = 0;
  for (const item of items) {
    if (isVideo(item)) recordings++;
    else images++;
    if (Array.isArray(item.tags) &&
        item.tags.some(tag => typeof tag === "string" && tag.trim().length > 0)) tagged++;
    if (Number.isSafeInteger(item.sizeBytes) && item.sizeBytes >= 0) {
      sizeBytes = Math.min(Number.MAX_SAFE_INTEGER, sizeBytes + item.sizeBytes);
    }
  }
  return { count: items.length, images, recordings, tagged, sizeBytes };
}
