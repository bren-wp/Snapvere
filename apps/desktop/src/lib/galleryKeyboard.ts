// Snapvere by Brendigo
/**
 * Window-scoped gallery keyboard shortcuts. Deliberately excludes modifier
 * combinations used by other applications or the recording/editor windows.
 */
export type GalleryShortcut = "search" | "refresh" | null;

export function galleryKeyboardShortcut(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
  shiftKey: boolean,
): GalleryShortcut {
  if (altKey || shiftKey) return null;
  if (key === "F5" && !ctrlKey && !metaKey) return "refresh";
  if (key.toLowerCase() === "f" && (ctrlKey !== metaKey)) return "search";
  return null;
}
