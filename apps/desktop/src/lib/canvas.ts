// Snapvere annotation rendering. Coordinates are logical canvas pixels.
import type { Annotation, Point } from "./types";
import { annotationBounds, arrowGeometry, pixelationSize, validPoint } from "./annotationGeometry";

export interface BlurSource {
  frozen: CanvasImageSource;
  originX: number;
  originY: number;
  scale: number;
}

type Context = CanvasRenderingContext2D;

function strokePath(context: Context, vertices: Point[]) {
  if (!vertices.length) return;
  context.beginPath();
  const [first, ...rest] = vertices;
  if (!rest.length) {
    context.arc(first.x, first.y, context.lineWidth / 2, 0, 2 * Math.PI);
    context.fill();
    return;
  }
  context.moveTo(first.x, first.y);
  for (const vertex of rest) context.lineTo(vertex.x, vertex.y);
  context.stroke();
}

function paintArrow(context: Context, start: Point, end: Point, size: number) {
  const shape = arrowGeometry(start, end, size);
  if (!shape) return;
  strokePath(context, [start, shape.shaftEnd]);
  context.beginPath();
  context.moveTo(end.x, end.y);
  for (const vertex of [shape.left, shape.notch, shape.right]) {
    context.lineTo(vertex.x, vertex.y);
  }
  context.closePath();
  context.fill();
}

/** Fail closed if pixel sampling is unavailable; pixelation itself is not a secrecy guarantee. */
function paintPixelation(context: Context, source: BlurSource, first: Point, last: Point) {
  const area = annotationBounds(first, last);
  const { x, y, width, height } = area;
  const target = pixelationSize(width, height);
  if (!target) return;
  const mask = () => {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#000";
    context.fillRect(x, y, width, height);
  };
  if (width < 2 || height < 2 || !Number.isFinite(source.scale) || source.scale <= 0) {
    mask();
    return;
  }
  const sample = [
    source.originX + x * source.scale,
    source.originY + y * source.scale,
    width * source.scale,
    height * source.scale,
  ] as const;
  if (!sample.every(Number.isFinite) || sample[2] <= 0 || sample[3] <= 0) {
    mask();
    return;
  }
  try {
    const buffer = document.createElement("canvas");
    buffer.width = target.width;
    buffer.height = target.height;
    const painter = buffer.getContext("2d");
    if (!painter) {
      mask();
      return;
    }
    // An opaque base prevents transparent or out-of-image samples revealing pixels below.
    painter.fillStyle = "#000";
    painter.fillRect(0, 0, target.width, target.height);
    painter.drawImage(source.frozen, ...sample, 0, 0, target.width, target.height);
    context.imageSmoothingEnabled = false;
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.drawImage(buffer, 0, 0, target.width, target.height, x, y, width, height);
  } catch {
    mask();
  }
}

function paintShape(context: Context, annotation: Annotation, first: Point, last: Point) {
  const area = annotationBounds(first, last);
  if (!Number.isFinite(area.width) || !Number.isFinite(area.height)) return;
  context.beginPath();
  if (annotation.tool === "rect") {
    const radius = Math.min(Math.max(2, annotation.size) * 1.5, area.width / 2, area.height / 2);
    context.roundRect(area.x, area.y, area.width, area.height, radius);
  } else {
    context.ellipse(
      area.x + area.width / 2, area.y + area.height / 2,
      area.width / 2, area.height / 2, 0, 0, Math.PI * 2,
    );
  }
  context.stroke();
}

const FONT = '-apple-system, "SF Pro Display", Inter, sans-serif';

function paintLabel(context: Context, annotation: Annotation, anchor: Point) {
  if (annotation.tool === "text") {
    context.font = `600 ${annotation.size}px ${FONT}`;
    context.textBaseline = "top";
    context.textAlign = "start";
    context.fillText(annotation.text ?? "", anchor.x, anchor.y);
    return;
  }
  const radius = Math.max(13, annotation.size * 2.4);
  context.beginPath();
  context.arc(anchor.x, anchor.y, radius, 0, 2 * Math.PI);
  context.fill();
  context.lineWidth = Math.max(2, annotation.size * 0.4);
  context.strokeStyle = "rgba(255,255,255,0.92)";
  context.stroke();
  context.fillStyle = "#fff";
  context.font = `700 ${Math.round(radius * 1.15)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(annotation.text ?? "", anchor.x, anchor.y + 1);
}

export function drawAnnotation(context: Context, annotation: Annotation, source: BlurSource) {
  const first = annotation.points[0];
  const last = annotation.points[1];
  if (!validPoint(first) || !Number.isFinite(annotation.size) || annotation.size <= 0) return;
  if (!annotation.points.every(validPoint)) return;
  // A single annotation owns its styling, never the caller's context state.
  context.save();
  try {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = annotation.size;
    switch (annotation.tool) {
      case "text":
      case "step":
        paintLabel(context, annotation, first);
        break;
      case "marker":
        context.globalAlpha = 0.35;
        context.lineWidth = annotation.size * 3;
        strokePath(context, annotation.points);
        break;
      case "pen":
        strokePath(context, annotation.points);
        break;
      default:
        if (!validPoint(last)) break;
        switch (annotation.tool) {
          case "arrow": paintArrow(context, first, last, annotation.size); break;
          case "line": strokePath(context, [first, last]); break;
          case "ellipse":
          case "rect": paintShape(context, annotation, first, last); break;
          case "blur": paintPixelation(context, source, first, last); break;
        }
    }
  } finally {
    context.restore();
  }
}

export function renderAnnotations(
  context: Context,
  list: Annotation[],
  draft: Annotation | null,
  source: BlurSource,
) {
  for (const annotation of list) drawAnnotation(context, annotation, source);
  if (draft) drawAnnotation(context, draft, source);
}
