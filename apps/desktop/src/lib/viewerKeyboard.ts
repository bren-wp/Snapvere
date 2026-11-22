// Snapvere by Brendigo
/** Viewer hotkeys must not hijack modified browser/OS shortcuts. */
export type ViewerShortcut =
  | "escape"
  | "previous"
  | "next"
  | "fullscreen"
  | "delete"
  | "copy-image"
  | "copy-path"
  | null;

export function viewerKeyboardShortcut(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
  shiftKey: boolean,
  video: boolean,
): ViewerShortcut {
  if (altKey || (ctrlKey && metaKey)) return null;
  const modified = ctrlKey || metaKey;
  if (modified) {
    if (key.toLowerCase() !== "c") return null;
    if (shiftKey) return "copy-path";
    return video ? null : "copy-image";
  }
  if (shiftKey) return null;
  switch (key) {
    case "Escape": return "escape";
    case "ArrowLeft": return "previous";
    case "ArrowRight": return "next";
    case "f":
    case "F": return "fullscreen";
    case "Delete": return "delete";
    default: return null;
  }
}

/** Return a focus target only at dialog boundaries, otherwise use native Tab. */
export function modalFocusWrapIndex(
  activeIndex: number,
  focusableCount: number,
  backwards: boolean,
): number | null {
  if (!Number.isSafeInteger(focusableCount) || focusableCount <= 0) return null;
  if (activeIndex < 0) return backwards ? focusableCount - 1 : 0;
  if (backwards && activeIndex === 0) return focusableCount - 1;
  if (!backwards && activeIndex === focusableCount - 1) return 0;
  return null;
}
