// Snapvere by Brendigo
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { EyeOff, Play, Square, Undo2, Redo2 } from "lucide-react";
import { ipc, type CropPreview, type PreviewMark } from "../lib/ipc";
import { useLanguage } from "../lib/LanguageProvider";

type Point = { x: number; y: number };

export default function RecPreview() {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<CropPreview | null>(null);
  const [marks, setMarks] = useState<PreviewMark[]>([]);
  const [redo, setRedo] = useState<PreviewMark[]>([]);
  const [historyDelta, setHistoryDelta] = useState(0);
  const [textValue, setTextValue] = useState("");
  const stroke = useRef<Point[]>([]);
  const [kind, setKind] = useState<PreviewMark["kind"]>("rectangle");
  const [draft, setDraft] = useState<PreviewMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const anchor = useRef<Point | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const epoch = useRef(0);
  const remaining = preview ? Math.max(0, preview.remaining - historyDelta) : 0;

  const load = useCallback(async () => {
    const id = ++epoch.current;
    setPreview(null);
    setMarks([]);
    setRedo([]);
    setHistoryDelta(0);
    setDraft(null);
    anchor.current = null;
    setError(false);
    try {
      const result = await ipc.getCropPreview();
      if (id === epoch.current) setPreview(result);
    } catch {
      if (id === epoch.current) setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const subs = [
      listen("snapvere:preview-refresh", () => void load()),
      listen("snapvere:rec-state", (event) => {
        if ((event.payload as { phase?: string })?.phase !== "paused") {
          ++epoch.current;
          setPreview(null);
          setMarks([]);
          setDraft(null);
          anchor.current = null;
        }
      }),
      listen("snapvere:rec-done", () => {
        ++epoch.current;
        setPreview(null);
        setMarks([]);
        setDraft(null);
      }),
    ];
    return () => {
      ++epoch.current;
      subs.forEach((sub) => void sub.then((unlisten) => unlisten()));
    };
  }, [load]);

  function point(event: React.PointerEvent<SVGSVGElement>): Point | null {
    if (!preview || !canvas.current) return null;
    // Invert the actual SVG transform rather than the CSS bounding box:
    // letterboxing, device scale and window resize cannot shift masks.
    const matrix = canvas.current.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return {
      x: Math.max(0, Math.min(preview.width, p.x)),
      y: Math.max(0, Math.min(preview.height, p.y)),
    };
  }

  function rectangle(a: Point, b: Point): PreviewMark {
    const x = Math.floor(Math.min(a.x, b.x));
    const y = Math.floor(Math.min(a.y, b.y));
    const points = [a, b].map((p) => ({
      x: Math.min((preview?.width ?? 1) - 1, Math.floor(p.x)),
      y: Math.min((preview?.height ?? 1) - 1, Math.floor(p.y)),
    }));
    return {
      kind,
      rect: {
        x: Math.min(x, (preview?.width ?? 1) - 1),
        y: Math.min(y, (preview?.height ?? 1) - 1),
        width: Math.max(1, Math.ceil(Math.max(a.x, b.x)) - x),
        height: Math.max(1, Math.ceil(Math.max(a.y, b.y)) - y),
      },
      points: ["line", "arrow", "pen", "marker"].includes(kind) ? points : undefined,
    };
  }

  function glyphMark(p: Point): PreviewMark | null {
    if (!preview) return null;
    const value = kind === "step" ? String(marks.filter((m) => m.kind === "step").length + 1) : textValue.trim();
    if (!value) return null;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const bitmap = document.createElement("canvas");
    bitmap.width = Math.min(256, preview.width - x);
    bitmap.height = Math.min(32, preview.height - y);
    if (!bitmap.width || !bitmap.height) return null;
    const ctx = bitmap.getContext("2d");
    if (!ctx) return null;
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.fillText(value.slice(0, 64), 0, 0, bitmap.width);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const glyph = Array.from({ length: bitmap.width * bitmap.height }, (_, i) => data[i * 4 + 3] >= 64 ? 1 : 0);
    if (!glyph.includes(1)) return null;
    return { kind, rect: { x, y, width: bitmap.width, height: bitmap.height }, glyph };
  }

  function add(mark: PreviewMark) {
    setMarks((previous) => [...previous, mark]);
    setRedo([]);
  }

  async function resume() {
    if (!preview || busy || anchor.current) return;
    setBusy(true);
    setError(false);
    try {
      await ipc.resumeCropPreview(preview.session, marks, historyDelta);
      setPreview(null);
      setMarks([]);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex h-screen min-h-0 flex-col gap-3 overflow-hidden bg-background p-4 text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("Recording preview")}</h1>
          <p className="text-xs text-muted">{t("Paused preview. Edits apply to future frames only.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy || !preview || marks.length >= remaining} onClick={() => setKind("rectangle")}
            aria-pressed={kind === "rectangle"} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">
            <Square size={16} /> {t("Rectangle")}
          </button>
          <button disabled={busy || !preview || marks.length >= remaining} onClick={() => setKind("mask")}
            aria-pressed={kind === "mask"} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">
            <EyeOff size={16} /> {t("Opaque mask")}
          </button>
          <select aria-label={t("Recording preview")} value={kind} disabled={busy || Boolean(draft)} onChange={(event) => setKind(event.target.value as PreviewMark["kind"])}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
            {([["rectangle","Rectangle"],["mask","Opaque mask"],["ellipse","Ellipse"],["line","Line"],["arrow","Arrow"],["pen","Pen"],["marker","Marker"],["text","Text"],["step","Numbered step"]] as const).map(([id, label]) =>
              <option key={id} value={id}>{t(label)}</option>)}
          </select>
          {kind === "text" && <input aria-label={t("Text")} maxLength={64} value={textValue} onChange={(e) => setTextValue(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-2 py-2 text-sm" />}
          <button disabled={busy || (!marks.length && (!preview || -historyDelta >= preview.undoCount))} onClick={() => {
            if (marks.length) {
              setRedo((previous) => [...previous, marks[marks.length - 1]]);
              setMarks((previous) => previous.slice(0, -1));
            } else setHistoryDelta((previous) => previous - 1);
          }} className="rounded-lg border border-border p-2 disabled:opacity-40" aria-label={t("Undo")}>
            <Undo2 size={16} />
          </button>
          <button disabled={busy || (!redo.length && (!preview || historyDelta >= preview.redoCount || marks.length > 0 || (historyDelta >= 0 && remaining === 0)))} onClick={() => {
            if (redo.length) {
              if (marks.length >= remaining) return;
              setMarks((previous) => [...previous, redo[redo.length - 1]]);
              setRedo((previous) => previous.slice(0, -1));
            } else setHistoryDelta((previous) => previous + 1);
          }} className="rounded-lg border border-border p-2 disabled:opacity-40" aria-label={t("Redo")}>
            <Redo2 size={16} />
          </button>
          {historyDelta !== 0 && <span className="text-xs">{historyDelta > 0 ? "+" : ""}{historyDelta}</span>}
          <button disabled={busy || !preview || Boolean(draft)} onClick={() => void resume()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-40">
            <Play size={16} /> {t("Resume")}
          </button>
        </div>
      </header>
      {error && <div role="alert" className="text-sm text-danger">{t("Recording preview unavailable. Try again or resume from the tray.")}</div>}
      {!preview && !error && <p className="text-sm text-muted">{t("Loading…")}</p>}
      {error && !preview && <button onClick={() => void load()} className="self-start rounded-lg border border-border px-3 py-2">{t("Change")}</button>}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
        {preview && (
          <svg ref={canvas} viewBox={`0 0 ${preview.width} ${preview.height}`}
            style={{ aspectRatio: preview.width / preview.height, maxHeight: "100%", maxWidth: "100%", touchAction: "none" }}
            className="block h-auto w-auto cursor-crosshair select-none"
            onPointerDown={(event) => {
              if (busy || anchor.current || marks.length >= remaining || event.button !== 0) return;
              const p = point(event);
              if (!p) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              if (kind === "text" || kind === "step") {
                const mark = glyphMark(p);
                if (mark) add(mark);
                return;
              }
              anchor.current = p;
              stroke.current = [p];
              setDraft(rectangle(p, p));
            }}
            onPointerMove={(event) => {
              const p = point(event);
              if (anchor.current && p) {
                const mark = rectangle(anchor.current, p);
                if (kind === "pen" || kind === "marker") {
                  if (stroke.current.length < 127) stroke.current.push(p);
                  mark.points = stroke.current.map((q) => ({ x: Math.min(preview.width - 1, Math.floor(q.x)), y: Math.min(preview.height - 1, Math.floor(q.y)) }));
                }
                setDraft(mark);
              }
            }}
            onPointerUp={(event) => {
              const p = point(event);
              const start = anchor.current;
              anchor.current = null;
              setDraft(null);
              if (!p || !start || busy) return;
              const mark = rectangle(start, p);
              if (kind === "pen" || kind === "marker") {
                mark.points = [...stroke.current, p].map((q) => ({ x: Math.min(preview.width - 1, Math.floor(q.x)), y: Math.min(preview.height - 1, Math.floor(q.y)) }));
              }
              if (mark.rect.width && mark.rect.height && marks.length < remaining) add(mark);
            }}
            onPointerCancel={() => { anchor.current = null; setDraft(null); }}>
            <defs><marker id="preview-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#09BFD9" /></marker></defs>
            <image href={preview.image} width={preview.width} height={preview.height} />
            {[...marks, ...(draft ? [draft] : [])].sort((a, b) => Number(a.kind === "mask") - Number(b.kind === "mask")).map((mark, i) => (
              <g key={i}>
                {mark.kind === "ellipse" ? <ellipse cx={mark.rect.x + mark.rect.width / 2} cy={mark.rect.y + mark.rect.height / 2} rx={mark.rect.width / 2} ry={mark.rect.height / 2} fill="none" stroke="#09BFD9" strokeWidth={2} />
                  : mark.points ? <polyline points={mark.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={mark.kind === "marker" ? "#ffdc00" : "#09BFD9"} strokeOpacity={mark.kind === "marker" ? .5 : 1} strokeWidth={mark.kind === "marker" ? 8 : 2} markerEnd={mark.kind === "arrow" ? "url(#preview-arrow)" : undefined} />
                  : mark.glyph ? <path fill="#09BFD9" d={mark.glyph.map((bit, index) => bit ? `M${mark.rect.x + index % mark.rect.width} ${mark.rect.y + Math.floor(index / mark.rect.width)}h1v1h-1z` : "").join("")} />
                  : <rect {...mark.rect} fill={mark.kind === "mask" ? "#000" : "none"} stroke={mark.kind === "mask" ? "none" : "#09BFD9"} strokeWidth={2} />}
              </g>
            ))}
          </svg>
        )}
      </div>
    </main>
  );
}
