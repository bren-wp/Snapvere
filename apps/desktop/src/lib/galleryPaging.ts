// Snapvere by Brendigo
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
