// Snapvere by Brendigo
// Pro-only gallery productivity actions. Never mutate a selection owned by React.
import { isVideo, type Screenshot } from "./types.ts";

export const PRO_BATCH_LIMIT = 100;
export type ProSelectionAction = "all" | "images" | "videos" | "recent" | "tagged" | "invert";
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function selectProBatch(
  selected: ReadonlySet<string>,
  visible: readonly Screenshot[],
  action: ProSelectionAction,
  nowMs = Date.now(),
): Set<string> {
  const next = new Set(selected);
  for (const item of visible) {
    if (action === "invert") {
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < PRO_BATCH_LIMIT) next.add(item.id);
    } else if (
      (action === "all" ||
        (action === "images" && !isVideo(item)) ||
        (action === "videos" && isVideo(item)) ||
        (action === "recent" && Number.isFinite(item.createdAt) &&
          item.createdAt <= nowMs && item.createdAt > nowMs - RECENT_WINDOW_MS) ||
        (action === "tagged" && Array.isArray(item.tags) &&
          item.tags.some(tag => typeof tag === "string" && tag.trim().length > 0))) &&
      next.size < PRO_BATCH_LIMIT
    ) {
      next.add(item.id);
    }
  }
  return next;
}
