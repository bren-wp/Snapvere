/**
 * Fit an image inside the media viewer without cropping oversized sources.
 *
 * A previous fixed 0.1 minimum zoom turned a 10,000px image into a 1,000px
 * preview inside a ~580px-high stage. The fitted ratio must be allowed to
 * fall below 10%, otherwise "Fit" silently clips tall or huge screenshots.
 */
export function fitImageScale(
  viewportWidth: number,
  viewportHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  horizontalPadding = 96,
  verticalPadding = 160,
): number {
  if (
    ![viewportWidth, viewportHeight, naturalWidth, naturalHeight].every(Number.isFinite) ||
    viewportWidth <= 0 || viewportHeight <= 0 ||
    naturalWidth <= 0 || naturalHeight <= 0
  ) return 1;
  const freeWidth = Math.max(1, viewportWidth - horizontalPadding);
  const freeHeight = Math.max(1, viewportHeight - verticalPadding);
  return Math.max(Number.MIN_VALUE, Math.min(1, freeWidth / naturalWidth, freeHeight / naturalHeight));
}
