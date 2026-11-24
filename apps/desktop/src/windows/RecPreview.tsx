// Snapvere by Brendigo
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { EyeOff, Play, Square, Undo2 } from "lucide-react";
import { ipc, type CropPreview, type PreviewMark } from "../lib/ipc";
import { useLanguage } from "../lib/LanguageProvider";

type Point = { x: number; y: number };

export default function RecPreview() {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<CropPreview | null>(null);
  const [marks, setMarks] = useState<PreviewMark[]>([]);
  const [kind, setKind] = useState<PreviewMark["kind"]>("rectangle");
  const [draft, setDraft] = useState<PreviewMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const anchor = useRef<Point | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const epoch = useRef(0);

  const load = useCallback(async () => {
    const id = ++epoch.current;
    setPreview(null);
    setMarks([]);
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
    const bounds = canvas.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: Math.max(0, Math.min(preview.width, (event.clientX - bounds.left) * preview.width / bounds.width)),
      y: Math.max(0, Math.min(preview.height, (event.clientY - bounds.top) * preview.height / bounds.height)),
    };
  }

  function rectangle(a: Point, b: Point): PreviewMark {
    const x = Math.floor(Math.min(a.x, b.x));
    const y = Math.floor(Math.min(a.y, b.y));
    return {
      kind,
      rect: {
        x,
        y,
        width: Math.ceil(Math.max(a.x, b.x)) - x,
        height: Math.ceil(Math.max(a.y, b.y)) - y,
      },
    };
  }

  async function resume() {
    if (!preview || busy || anchor.current) return;
    setBusy(true);
    setError(false);
    try {
      await ipc.resumeCropPreview(preview.session, marks);
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
          <button disabled={busy || !preview || marks.length >= preview.remaining} onClick={() => setKind("rectangle")}
            aria-pressed={kind === "rectangle"} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">
            <Square size={16} /> {t("Rectangle")}
          </button>
          <button disabled={busy || !preview || marks.length >= preview.remaining} onClick={() => setKind("mask")}
            aria-pressed={kind === "mask"} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">
            <EyeOff size={16} /> {t("Opaque mask")}
          </button>
          <button disabled={busy || !marks.length} onClick={() => setMarks((previous) => previous.slice(0, -1))}
            className="rounded-lg border border-border p-2 disabled:opacity-40" aria-label={t("Undo")}>
            <Undo2 size={16} />
          </button>
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
              if (busy || marks.length >= preview.remaining || event.button !== 0) return;
              const p = point(event);
              if (!p) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              anchor.current = p;
              setDraft(rectangle(p, p));
            }}
            onPointerMove={(event) => {
              const p = point(event);
              if (anchor.current && p) setDraft(rectangle(anchor.current, p));
            }}
            onPointerUp={(event) => {
              const p = point(event);
              const start = anchor.current;
              anchor.current = null;
              setDraft(null);
              if (!p || !start) return;
              const mark = rectangle(start, p);
              if (mark.rect.width && mark.rect.height) setMarks((previous) => [...previous, mark]);
            }}
            onPointerCancel={() => { anchor.current = null; setDraft(null); }}>
            <image href={preview.image} width={preview.width} height={preview.height} />
            {[...marks, ...(draft ? [draft] : [])].sort((a, b) => Number(a.kind === "mask") - Number(b.kind === "mask")).map((mark, i) => (
              <rect key={i} {...mark.rect} fill={mark.kind === "mask" ? "#000" : "none"} stroke={mark.kind === "mask" ? "none" : "#09BFD9"} strokeWidth={2} />
            ))}
          </svg>
        )}
      </div>
    </main>
  );
}
