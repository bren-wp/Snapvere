// Snapvere by Brendigo
import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  EyeOff,
  Highlighter,
  ListOrdered,
  Mic,
  Minus,
  MousePointer2,
  Pause,
  PenTool,
  Play,
  Square,
  Type,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { useLanguage } from "../lib/LanguageProvider";
import { formatMediaSize } from "../lib/mediaFormatting";
import { runRecordingAction } from "../lib/recordingControls";
import type { DrawToolMsg, RecordStatus, RecTool } from "../lib/types";

/**
 * Plutajuća traka koja stoji iznad svega dok snimanje traje.
 *
 * Vlastiti prozor je namjeran: HUD mora preživjeti zatvaranje galerije i — bitnije —
 * izuzet je iz capture-a (`WDA_EXCLUDEFROMCAPTURE`), pa toolbar nikad ne završi u
 * snimci. Sami potezi se crtaju u zasebnom prozoru `recdraw` koji JEST snimljen;
 * ovdje se samo bira alat i šalje preko `snapvere:draw-*` eventa.
 */

const TOOLS: { id: RecTool; icon: typeof Square; label: string }[] = [
  { id: "off", icon: MousePointer2, label: "Click through (drawing off)" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "ellipse", icon: Circle, label: "Ellipse" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "pen", icon: PenTool, label: "Pen" },
  { id: "marker", icon: Highlighter, label: "Marker" },
  { id: "step", icon: ListOrdered, label: "Numbered step" },
  { id: "blur", icon: EyeOff, label: "Blur / redact" },
  { id: "text", icon: Type, label: "Text" },
];

const SWATCHES = [
  "#FF453A", "#FF9F0A", "#FFD60A", "#30D158", "#40C8E0",
  "#09BFD9", "#BF5AF2", "#FF375F", "#FFFFFF", "#1C1C1E",
];

export default function RecBar() {
  const { t, language } = useLanguage();
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<RecordStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<RecTool>("off");
  const [color, setColor] = useState("#FF453A");
  const [size, setSize] = useState(6);
  const [palette, setPalette] = useState(false);
  const closing = useRef({ current: false });
  const sessionRef = useRef<string | null>(null);

  // A 58px native HUD clips popovers positioned above its toolbar. Ask Rust
  // for a taller window only while the palette or an error is visible.
  useEffect(() => {
    void ipc.setRecHudExpanded(palette || Boolean(actionError)).catch((error) => {
      console.error("Could not resize recording HUD for popup", error);
    });
  }, [palette, actionError]);

  // Tick iz Rusta (~4x/s) je izvor istine za tajmer — nema drifta u JS-u.
  useEffect(() => {
    let active = true;
    let seenState = false;
    const subs = [
      listen<RecordStatus>("snapvere:rec-tick", (e) => {
        if (e.payload.sessionId === sessionRef.current) setStatus(e.payload);
      }),
      listen<RecordStatus>("snapvere:rec-state", (e) => {
        if (!active) return;
        seenState = true;
        const nextSession = e.payload.sessionId ?? null;
        if (nextSession !== sessionRef.current) {
          // A pending action keeps its original lock object, never the next session's.
          closing.current = { current: false };
          setBusy(false);
          setActionError(null);
        }
        sessionRef.current = nextSession;
        setStatus(e.payload);
      }),
      listen("snapvere:rec-done", () => {
        closing.current.current = true;
        setActionError(null);
        // Sljedeće snimanje kreće bez alata i palete — sloj za crtanje je ionako
        // click-through nakon zatvaranja, pa bi "zalijepljen" alat samo zbunjivao.
        setTool("off");
        setPalette(false);
        void ipc.closeRecHud();
      }),
      // Sloj za crtanje može sam ugasiti alat (Esc) — traka mora pratiti.
      listen<DrawToolMsg>("snapvere:draw-tool", (e) => {
        // Only the active overlay can turn off the current tool.
        if (e.payload.sessionId === sessionRef.current) setTool(e.payload.tool);
      }),
    ];
    // Prvi status odmah, da traka ne bljesne prazna.
    void Promise.all(subs).then(async () => {
      if (!active) return;
      const initial = await ipc.recordingStatus();
      if (active && !seenState) {
        sessionRef.current = initial.sessionId ?? null;
        setStatus(initial);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
      subs.forEach((s) => void s.then((un) => un()).catch(() => undefined));
    };
  }, []);

  const sendTool = useCallback((t: RecTool, c: string, s: number) => {
    if (status?.sessionId) {
      void emit("snapvere:draw-tool", { tool: t, color: c, size: s, sessionId: status.sessionId });
    }
  }, [status?.sessionId]);

  const pickTool = (t: RecTool) => {
    const next = t === tool && t !== "off" ? "off" : t;
    setTool(next);
    setPalette(false);
    sendTool(next, color, size);
  };

  const paused = status?.phase === "paused";
  const finishing = status?.phase === "finishing";

  const togglePause = useCallback(async () => {
    if (busy || finishing || !status?.sessionId) return;
    const sessionId = status.sessionId;
    setBusy(true);
    try {
      const next = await ipc.pauseRecording(!paused, sessionId);
      if (sessionRef.current === sessionId) {
        setStatus(next);
        setActionError(null);
      }
    } catch (error) {
      console.error(error);
      if (sessionRef.current === sessionId) setActionError(t("Could not change pause state. Try again."));
    } finally {
      if (sessionRef.current === sessionId) setBusy(false);
    }
  }, [busy, finishing, paused, status?.sessionId, t]);

  const finish = useCallback(async (discard: boolean) => {
    const sessionId = status?.sessionId;
    if (!sessionId || sessionId !== sessionRef.current || finishing) return;
    const lock = closing.current;
    try {
      const completed = await runRecordingAction(lock, () =>
        discard ? ipc.cancelRecording(sessionId) : ipc.stopRecording(sessionId),
      );
      if (completed && sessionRef.current === sessionId) setActionError(null);
    } catch (error) {
      console.error(error);
      if (sessionRef.current === sessionId) {
        setActionError(t(discard
          ? "Could not discard recording. Try again."
          : "Could not stop recording. Try again."));
      }
    }
  }, [finishing, status?.sessionId, t]);

  // Namjerno bez tipkovničkih prečaca: HUD je WS_EX_NOACTIVATE (nikad nema fokus), pa
  // tipke koje korisnik pritisne u svojoj aplikaciji ne mogu slučajno zaustaviti snimanje.

  return (
    <div
      data-tauri-drag-region
      className="absolute bottom-0 left-0 flex h-[58px] w-full cursor-grab select-none items-center gap-1.5 rounded-2xl bg-black/85 px-3 text-white shadow-[0_10px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/15 backdrop-blur-xl active:cursor-grabbing"
    >
      {actionError && (
        <div role="alert" className="absolute bottom-[calc(100%+8px)] left-3 right-3 rounded-xl border border-red-400/50 bg-[#301719] px-3 py-2 text-xs font-medium text-white shadow-lg">
          {actionError}
        </div>
      )}
      {/* stanje + tajmer */}
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          finishing ? "bg-white/50" : paused ? "bg-warn" : "animate-rec-pulse bg-danger"
        }`}
      />
      <span className="mr-1 min-w-[50px] font-mono text-[15px] font-semibold tabular-nums">
        {fmtTime(status?.elapsedMs ?? 0)}
      </span>

      <span className="h-6 w-px shrink-0 bg-white/15" />

      {/* alati za crtanje — potezi idu u prozor recdraw, koji JEST snimljen */}
      {TOOLS.map((toolInfo) => (
        <button
          key={toolInfo.id}
          title={t(toolInfo.label)}
          aria-label={t(toolInfo.label)}
          onClick={() => pickTool(toolInfo.id)}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
            tool === toolInfo.id ? "bg-accent text-white" : "hover:bg-white/15"
          }`}
        >
          <toolInfo.icon size={15} strokeWidth={2} />
        </button>
      ))}

      <button
        title={t("Colour")}
        aria-label={t("Colour")}
        onClick={() => setPalette((v) => !v)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/15"
      >
        <span
          className="h-4 w-4 rounded-full border border-white/40"
          style={{ background: color }}
        />
      </button>

      <button
        title={t("Undo")}
        aria-label={t("Undo")}
        onClick={() => status?.sessionId && void emit("snapvere:draw-undo", { sessionId: status.sessionId })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/15"
      >
        <Undo2 size={15} />
      </button>
      <button
        title={t("Clear all drawings")}
        aria-label={t("Clear all drawings")}
        onClick={() => status?.sessionId && void emit("snapvere:draw-clear", { sessionId: status.sessionId })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/15"
      >
        <Eraser size={15} />
      </button>

      <span className="h-6 w-px shrink-0 bg-white/15" />

      {/* kontrole snimanja */}
      <button
        onClick={togglePause}
        disabled={busy || finishing}
        title={t(paused ? "Resume" : "Pause")}
        aria-label={t(paused ? "Resume" : "Pause")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      <button
        onClick={() => void finish(false)}
        disabled={finishing || !status?.sessionId}
        title={t("Stop and save")}
        aria-label={t("Stop and save")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-danger transition hover:brightness-110 active:scale-95 disabled:opacity-40"
      >
        <Square size={13} fill="currentColor" />
      </button>
      <button
        onClick={() => void finish(true)}
        disabled={finishing || !status?.sessionId}
        title={t("Discard")}
        aria-label={t("Discard")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
      >
        <X size={15} />
      </button>

      <span className="ml-auto min-w-0 shrink overflow-hidden whitespace-nowrap pl-1 text-right font-mono text-[10px] leading-tight text-white/45">
        {finishing ? (
          t("Saving…")
        ) : (
          <>
            {status?.width ?? 0}×{status?.height ?? 0}
            <br />
            <span className="inline-flex items-center gap-1">
              {(status?.format ?? "mp4").toUpperCase()}
              {status?.mic && <Mic size={10} className="text-accent" />}
              {status?.systemAudio && <Volume2 size={10} className="text-accent" />}
              {status?.sizeBytes ? ` · ${formatMediaSize(status.sizeBytes, language)}` : ""}
            </span>
          </>
        )}
      </span>

      {/* paleta — iznad trake, izvan snimanog područja jer je cijeli HUD izuzet */}
      {palette && (
        <div className="absolute bottom-[calc(100%+8px)] right-3 rounded-2xl bg-black/90 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/15 animate-pop">
          <div className="grid grid-cols-5 gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setPalette(false);
                  sendTool(tool, c, size);
                }}
                className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-white/70">{t("Size")}</span>
            <input
              type="range"
              min={2}
              max={28}
              value={size}
              onChange={(e) => {
                const s = +e.target.value;
                setSize(s);
                sendTool(tool, color, s);
              }}
              className="w-28"
            />
            <span className="w-5 text-right font-mono text-[11px] text-white/70">{size}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

