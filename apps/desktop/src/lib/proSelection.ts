// Snapvere by Brendigo
// Pro-only gallery productivity actions. Never mutate a selection owned by React.
import { isVideo, type Screenshot } from "./types.ts";

export const PRO_BATCH_LIMIT = 100;
export const PRO_LARGE_FILE_BYTES = 10 * 1024 * 1024;
export type ProSelectionAction = "all" | "images" | "videos" | "recent" | "tagged" | "invert" | "week" | "large" | "untagged";
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function hasTags(item: Screenshot): boolean {
  return Array.isArray(item.tags) && item.tags.some(tag => typeof tag === "string" && tag.trim().length > 0);
}
function within(item: Screenshot, nowMs: number, duration: number): boolean {
  return Number.isFinite(nowMs) && Number.isFinite(item.createdAt) &&
    item.createdAt <= nowMs && item.createdAt > nowMs - duration;
}

export function selectProBatch(
  selected: ReadonlySet<string>,
  visible: readonly Screenshot[],
  action: ProSelectionAction,
  nowMs = Date.now(),
): Set<string> {
  const next = new Set(selected);
  // Remove previously selected loaded items first. A full batch must still
  // be invertible regardless of the order of the gallery cards.
  if (action === "invert") {
    for (const item of visible) next.delete(item.id);
    for (const item of visible) {
      if (!selected.has(item.id) && next.size < PRO_BATCH_LIMIT) next.add(item.id);
    }
    return next;
  }
  for (const item of visible) {
    if (next.size >= PRO_BATCH_LIMIT) break;
    if (
      action === "all" ||
      (action === "images" && !isVideo(item)) ||
      (action === "videos" && isVideo(item)) ||
      (action === "recent" && within(item, nowMs, RECENT_WINDOW_MS)) ||
      (action === "week" && within(item, nowMs, 7 * RECENT_WINDOW_MS)) ||
      (action === "large" && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes >= PRO_LARGE_FILE_BYTES) ||
      (action === "tagged" && hasTags(item)) ||
      (action === "untagged" && !hasTags(item))
    ) next.add(item.id);
  }
  return next;
}

export function retainLoadedProSelection(selected: ReadonlySet<string>, visible: readonly Screenshot[]): Set<string> {
  const loaded = new Set(visible.map(item => item.id));
  return new Set([...selected].filter(id => loaded.has(id)));
}

export function summarizeProSelection(selected: ReadonlySet<string>, visible: readonly Screenshot[]) {
  let sizeBytes = 0;
  const seen = new Set<string>();
  for (const item of visible) {
    if (!selected.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    if (Number.isSafeInteger(item.sizeBytes) && item.sizeBytes >= 0) {
      sizeBytes = Math.min(Number.MAX_SAFE_INTEGER, sizeBytes + item.sizeBytes);
    }
  }
  return { loaded: seen.size, hidden: selected.size - seen.size, sizeBytes };
}
