// Snapvere by Brendigo
import type { Point } from "./types";

export function validPoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function annotationBounds(first: Point, last: Point) {
  return {
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
    width: Math.abs(last.x - first.x),
    height: Math.abs(last.y - first.y),
  };
}

export function arrowGeometry(start: Point, end: Point, width: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const depth = Math.min(length, Math.max(13, width * 3.4));
  const half = depth * Math.sin(Math.PI / 6.5);
  const base = depth * Math.cos(Math.PI / 6.5);
  return {
    shaftEnd: { x: end.x - ux * depth * 0.9, y: end.y - uy * depth * 0.9 },
    left: { x: end.x - ux * base - uy * half, y: end.y - uy * base + ux * half },
    notch: { x: end.x - ux * depth * 0.6, y: end.y - uy * depth * 0.6 },
    right: { x: end.x - ux * base + uy * half, y: end.y - uy * base - ux * half },
  };
}

/** Limit temporary pixelation storage independently of screen size and DPI. */
export function pixelationSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const dimension = (value: number) => Math.min(1024, Math.max(1, Math.floor(value * 0.08)));
  return { width: dimension(width), height: dimension(height) };
}
