// Snapvere by Brendigo
/**
 * Prevent overlapping Stop/Discard invocations. An acknowledgement holds the
 * lock until the native rec-done event; a failure releases it so the user can
 * retry without hiding the recording HUD or leaving a live recorder headless.
 */
export async function runRecordingAction(
  lock: { current: boolean },
  action: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await action();
    return true;
  } catch (error) {
    lock.current = false;
    throw error;
  }
}

/** Missing or stale terminal event identifiers must never mutate the current HUD. */
export function matchesRecordingSession(
  current: string | null,
  requested: string | null | undefined,
): boolean {
  return Boolean(current && requested && current === requested);
}
