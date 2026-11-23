// Snapvere by Brendigo
// Pro-only gallery productivity actions. Never mutate a selection owned by React.
import { isVideo, type Screenshot } from "./types";

export const PRO_BATCH_LIMIT = 100;
export type ProSelectionAction = "all" | "images" | "videos" | "invert";

export function selectProBatch(
  selected: ReadonlySet<string>,
  visible: readonly Screenshot[],
  action: ProSelectionAction,
): Set<string> {
  const next = new Set(selected);
  for (const item of visible) {
    if (action === "invert") {
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < PRO_BATCH_LIMIT) next.add(item.id);
    } else if (
      (action === "all" ||
        (action === "images" && !isVideo(item)) ||
        (action === "videos" && isVideo(item))) &&
      next.size < PRO_BATCH_LIMIT
    ) {
      next.add(item.id);
    }
  }
  return next;
}
