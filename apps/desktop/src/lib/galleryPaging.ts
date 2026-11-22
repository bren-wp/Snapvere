// Snapvere by Brendigo
export type GalleryFilter = "all" | "images" | "videos";
export type GallerySelection = Readonly<{ query: string; filter: GalleryFilter }>;

/**
 * Stable gallery selection shared by event callbacks and async continuations.
 * Delayed clipboard imports and recording completions must query the CURRENT
 * selected category, not the category captured when a callback was created.
 * Snapshots are independent so pending SQL requests keep their own criteria.
 */
export function createGallerySelectionStore() {
  let selection: GallerySelection = { query: "", filter: "all" };
  return {
    snapshot: (): GallerySelection => selection,
    setQuery: (query: string): void => {
      selection = { ...selection, query };
    },
    setFilter: (filter: GalleryFilter): void => {
      selection = { ...selection, filter };
    },
  };
}

/** Keep pagination aligned when a loaded capture is deleted.
 * OFFSET counts rows previously fetched, not the number of pages displayed.
 * Deleting a visible row shifts every older row one position toward the front.
 */
export function offsetAfterDeletingLoadedCapture<T extends { id: string }>(
  loaded: readonly T[],
  deletedId: string,
  previousOffset: number,
): number {
  return Math.max(0, previousOffset - (loaded.some((item) => item.id === deletedId) ? 1 : 0));
}

/** Fetch one extra SQL row to determine whether another page really exists.
 * The look-ahead row is never rendered or included in the next OFFSET.
 */
export function splitGalleryPage<T>(fetched: readonly T[], pageSize: number): {
  page: T[];
  hasMore: boolean;
} {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("Invalid gallery page size");
  }
  return {
    page: fetched.slice(0, pageSize),
    hasMore: fetched.length > pageSize,
  };
}

/** Merge overlapping gallery pages without duplicates, including duplicates within a page. */
export function mergeUniqueById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  return existing.concat(
    incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  );
}
