// Snapvere by Brendigo
export type ReviewRange = { start: number; end: number };
export const MIN_REVIEW_SECONDS = 0.1;

export function validReviewRange(range: ReviewRange | null, duration: number): range is ReviewRange {
  return range !== null && Number.isFinite(duration) && duration > 0
    && Number.isFinite(range.start) && Number.isFinite(range.end)
    && range.start >= 0 && range.end <= duration
    && range.end - range.start >= MIN_REVIEW_SECONDS;
}

export function setReviewBoundary(
  range: ReviewRange | null, edge: "start" | "end", time: number, duration: number,
): ReviewRange | null {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration < MIN_REVIEW_SECONDS) return null;
  const current = validReviewRange(range, duration) ? range : { start: 0, end: duration };
  const value = Math.max(0, Math.min(duration, time));
  const next = { ...current, [edge]: value };
  return validReviewRange(next, duration) ? next : current;
}

export function reviewLoopTarget(
  range: ReviewRange | null, enabled: boolean, time: number, duration: number,
): number | null {
  if (!enabled || !validReviewRange(range, duration) || !Number.isFinite(time)) return null;
  return time < range.start || time >= range.end ? range.start : null;
}
