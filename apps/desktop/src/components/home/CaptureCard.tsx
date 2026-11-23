// Snapvere by Brendigo
import { convertFileSrc } from "@tauri-apps/api/core";
import { Copy, FolderOpen, Trash2, Video, Play } from "lucide-react";
import type { Screenshot } from "../../lib/types";
import { isVideo } from "../../lib/types";
import { useLanguage } from "../../lib/LanguageProvider";
import { formatMediaSize } from "../../lib/mediaFormatting";

export default function CaptureCard({
  shot,
  onOpen,
  onReveal,
  onCopyPath,
  onDelete,
  selected,
  onToggleSelect,
  selectLabel,
}: {
  shot: Screenshot;
  onOpen: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
  onDelete: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectLabel?: string;
}) {
  const { t, language } = useLanguage();
  const video = isVideo(shot);
  // MP4 se ne moze prikazati u <img>; bez thumbnaila ide placeholder.
  const src = shot.thumbPath ?? (video ? null : shot.filePath);
  return (
    <article
      role="group"
      aria-label={shot.name}
      className="snapvere-gallery-card group relative overflow-hidden outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card focus-within:ring-2 focus-within:ring-accent"
    >
      {onToggleSelect && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleSelect(); }}
          aria-pressed={!!selected} aria-label={`${selectLabel ?? "Select"}: ${shot.name}`}
          className={`absolute left-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-lg border text-sm font-semibold focus-visible:ring-2 focus-visible:ring-accent ${selected ? "border-accent bg-accent text-black" : "border-white/50 bg-black/70 text-white hover:border-accent"}`}>
          {selected ? "✓" : "+"}
        </button>
      )}
      {/* A real focusable button; utility buttons are siblings, never nested in it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t(video ? "Play recording" : "View screenshot")}: ${shot.name}`}
        className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      />
      <div className="pointer-events-none relative aspect-video w-full bg-black/30">
        {src ? (
          <img
            src={convertFileSrc(src)}
            alt={shot.name}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted">
            <Video size={26} />
          </div>
        )}
        {video && (
          <>
            <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black/65 text-white shadow-card ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
                <Play size={18} fill="currentColor" className="ml-0.5" />
              </span>
            </div>
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white">
              <Play size={8} fill="currentColor" />
              {shot.format}
            </span>
          </>
        )}
      </div>
      <div className="pointer-events-none relative px-3 py-2">
        <div className="truncate text-[13px] font-medium">{shot.name}</div>
        <div className="font-mono text-[11px] text-muted">
          {shot.width}×{shot.height} · {formatMediaSize(shot.sizeBytes, language)}
        </div>
      </div>
      <div
        className="snapvere-gallery-card-actions absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReveal();
          }}
          title={t("Show in folder")}
          aria-label={`${t("Show in folder")}: ${shot.name}`}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
        >
          <FolderOpen size={15} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopyPath();
          }}
          title={t("Copy file path")}
          aria-label={`${t("Copy file path")}: ${shot.name}`}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
        >
          <Copy size={15} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={t("Delete")}
          aria-label={`${t("Delete")}: ${shot.name}`}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition hover:bg-danger"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}
