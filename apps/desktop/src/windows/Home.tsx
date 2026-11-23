// Snapvere by Brendigo
import { useCallback, useEffect, useRef, useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { readCapturePreferences } from "../lib/capturePreferencesStore";
import { clipboardImportCopy } from "../lib/clipboardImportCopy";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowUpRight,
  Crop,
  ClipboardPaste,
  FolderOpen,
  Monitor,
  RefreshCw,
  Settings as SettingsIcon,
  Search,
  Video,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { useLanguage } from "../lib/LanguageProvider";
import { isVideo } from "../lib/types";
import {
  createGallerySelectionStore,
  mergeUniqueById,
  offsetAfterDeletingLoadedCapture,
  splitGalleryPage,
} from "../lib/galleryPaging";
import type { GalleryFilter } from "../lib/galleryPaging";
import { galleryStatusCopy } from "../lib/galleryStatusCopy";
import { galleryKeyboardShortcut } from "../lib/galleryKeyboard";
import type { RecordDone, Screenshot } from "../lib/types";
import WindowFrame from "../components/WindowFrame";
import { APP_NAME, IS_PRO } from "../lib/edition";
import { proGalleryCopy } from "../lib/proGalleryCopy";
import { selectProBatch } from "../lib/proSelection";
import Viewer from "../components/Viewer";
import CaptureCard from "../components/home/CaptureCard";
import EmptyGallery from "../components/home/EmptyGallery";
import UpdateNotice from "../components/UpdateNotice";

type Filter = GalleryFilter;
const PAGE_SIZE = 120;

export default function Home() {
  const { t, language } = useLanguage();
  const clipboardText = clipboardImportCopy(language);
  const galleryText = galleryStatusCopy(language);
  const proText = proGalleryCopy(language);
  const [items, setItems] = useState<Screenshot[]>([]);
  const [proBatchMode, setProBatchMode] = useState(false);
  const [proSelected, setProSelected] = useState<Set<string>>(() => new Set());
  const [proExportBusy, setProExportBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [galleryError, setGalleryError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeSelection] = useState(createGallerySelectionStore);
  const [toast, setToast] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  /** Otvoren u pregledniku (id, ne indeks — lista se osvježava ispod njega). */
  const [viewId, setViewId] = useState<string | null>(null);
  const galleryRequest = useRef(0);
  const pagingBusy = useRef(false);
  const pagingToken = useRef(0);
  const pageOffset = useRef(0);
  const loadedItems = useRef<Screenshot[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);

  // A new query, refresh, or deletion must supersede any older page request.
  // Tokens also keep an obsolete promise's finally block from clearing the
  // busy indicator of a newer request.
  const invalidatePaging = useCallback(() => {
    pagingToken.current += 1;
    pagingBusy.current = false;
    setLoadingMore(false);
  }, []);

  const load = useCallback(async () => {
    // Always read the latest selection: captures, clipboard imports and native
    // events can finish after a user changes the gallery category or query.
    const { query: currentQuery, filter: currentFilter } = activeSelection.snapshot();
    const request = ++galleryRequest.current;
    invalidatePaging();
    setLoading(true);
    setGalleryError(false);
    try {
      const res = currentQuery.trim()
        ? await ipc.searchScreenshots(currentQuery, PAGE_SIZE + 1, 0, currentFilter)
        : await ipc.listScreenshots(PAGE_SIZE + 1, 0, currentFilter);
      if (request === galleryRequest.current) {
        const { page, hasMore: more } = splitGalleryPage(res, PAGE_SIZE);
        pageOffset.current = page.length;
        loadedItems.current = page;
        setItems(page);
        setHasMore(more);
      }
    } catch (e) {
      console.error(e);
      if (request === galleryRequest.current) {
        setGalleryError(true);
        setToast(t("Could not load the gallery"));
      }
    } finally {
      if (request === galleryRequest.current) setLoading(false);
    }
  }, [t, invalidatePaging, activeSelection]);

  const loadMore = useCallback(async () => {
    if (pagingBusy.current || loading || !hasMore) return;
    pagingBusy.current = true;
    const pageToken = ++pagingToken.current;
    const request = galleryRequest.current;
    const offset = pageOffset.current;
    const { query: currentQuery, filter: currentFilter } = activeSelection.snapshot();
    setLoadingMore(true);
    try {
      const res = currentQuery.trim()
        ? await ipc.searchScreenshots(currentQuery, PAGE_SIZE + 1, offset, currentFilter)
        : await ipc.listScreenshots(PAGE_SIZE + 1, offset, currentFilter);
      if (request !== galleryRequest.current) return;
      const { page, hasMore: more } = splitGalleryPage(res, PAGE_SIZE);
      pageOffset.current = offset + page.length;
      const merged = mergeUniqueById(loadedItems.current, page);
      loadedItems.current = merged;
      setItems(merged);
      setHasMore(more);
    } catch (error) {
      if (request === galleryRequest.current) {
        setToast(`${t("Could not load older captures:")} ${String(error)}`);
      }
    } finally {
      if (pageToken === pagingToken.current) {
        pagingBusy.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, loading, activeSelection, t]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(t);
      galleryRequest.current += 1;
    };
  }, [query, filter, load]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = galleryKeyboardShortcut(
        event.key, event.ctrlKey, event.metaKey, event.altKey, event.shiftKey,
      );
      if (action === "refresh") {
        // F5 must never hard-reload the WebView and disrupt unsaved work.
        // While Viewer is open or a refresh is pending, consume but do not run.
        event.preventDefault();
        if (!viewId && !loading && !event.repeat) void load();
      } else if (action === "search" && !viewId && searchInput.current) {
        event.preventDefault();
        if (!event.repeat) {
          searchInput.current.focus();
          searchInput.current.select();
        }
      }
    };
    // Capture phase is essential: CaptureCard's action row intentionally
    // stops bubbling key events. F5 must still be prevented from hard-reloading
    // the WebView when a card's Delete/Copy/Reveal button owns focus.
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  }, [load, loading, viewId]);

  useEffect(() => {
    const w = getCurrentWindow();
    const un = w.onFocusChanged(({ payload }) => {
      if (payload) void load();
    });
    return () => void un.then((f) => f());
  }, [load]);

  // Snimanje i tray-capture zavrsavaju izvan ovog prozora — event je jedini signal.
  useEffect(() => {
    const subs = [
      listen<RecordDone>("snapvere:rec-done", (e) => {
        const { error, cancelled } = e.payload;
        if (error) {
          console.error("Recording error stored locally", error);
          setToast(t("Recording failed. Open Diagnostics for details."));
        }
        else if (!cancelled) {
          setToast(t("Recording saved"));
          void load();
        }
      }),
      listen<Screenshot>("snapvere:shot-saved", () => void load()),
      listen<string>("snapvere:toast", (e) => setToast(t(e.payload))),
    ];
    return () => {
      subs.forEach((x) => void x.then((un) => un()));
    };
  }, [load, t]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // SQL applies the selected category before LIMIT/OFFSET, so older media
  // cannot disappear merely because recent captures belong to another kind.
  const visible = items;

  const toggleProItem = (id: string) => {
    if (!IS_PRO) return;
    setProSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 100) next.add(id);
      else setToast(proText.limit);
      return next;
    });
  };

  const exportProSelection = async () => {
    if (!IS_PRO || proExportBusy || !proSelected.size) return;
    setProExportBusy(true);
    try {
      const count = await ipc.proExportBatch([...proSelected]);
      if (count > 0) {
        setToast(proText.exported(count));
        setProSelected(new Set());
        setProBatchMode(false);
      }
    } catch (error) {
      console.error("Local Pro batch export failed", error);
      setToast(proText.failed);
    } finally {
      setProExportBusy(false);
    }
  };

  const onDelete = useCallback(async (s: Screenshot) => {
    const ok = await ask(`"${s.name}" — ${t("This item will be removed from the gallery and deleted from disk.")}`, {
      title: t(isVideo(s) ? "Delete recording?" : "Delete screenshot?"),
      kind: "warning",
      okLabel: t("Delete"),
      cancelLabel: t("Cancel"),
    });
    if (!ok) return false;
    try {
      await ipc.deleteScreenshot(s.id);
      setProSelected((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
      const currentlyLoaded = loadedItems.current;
      if (currentlyLoaded.some((item) => item.id === s.id)) {
        // Discard in-flight pages; their SQL offsets predate the deletion.
        galleryRequest.current += 1;
        invalidatePaging();
        pageOffset.current = offsetAfterDeletingLoadedCapture(
          currentlyLoaded,
          s.id,
          pageOffset.current,
        );
        const remaining = currentlyLoaded.filter((item) => item.id !== s.id);
        loadedItems.current = remaining;
        setItems(remaining);
        setLoading(false);
      }
      return true;
    } catch (e) {
      setToast(`${t("Could not delete capture:")} ${String(e)}`);
      return false;
    }
  }, [t, invalidatePaging]);

  const copyPath = useCallback(async (s: Screenshot) => {
    try {
      await ipc.copyMediaPath(s.id);
      setToast(t("File path copied"));
    } catch (error) {
      setToast(`${t("Copy file path")}: ${String(error)}`);
    }
  }, [t]);

  const reveal = useCallback(async (s: Screenshot) => {
    try {
      await ipc.revealMedia(s.id);
    } catch (e) {
      console.error("Cannot reveal local gallery file", e);
      setToast(t("Could not open the image. Invalid capture reference."));
    }
  }, [t]);

  const closeViewer = useCallback(() => setViewId(null), []);

  const captureRegion = async () => {
    try {
      await getCurrentWindow().hide();
      await ipc.beginRegionCapture();
    } catch (e) {
      await getCurrentWindow().show().catch(console.error);
      console.error("Local capture error", e);
      setToast(t("Screen capture failed. Open Diagnostics for details."));
    }
  };
  const captureFull = async () => {
    if (captureBusy) return;
    setCaptureBusy(true);
    const win = getCurrentWindow();
    try {
      // Hide our own gallery before the OS takes its framebuffer snapshot.
      // A short compositor delay prevents the disappearing WebView from being
      // captured on slower Windows / WebView2 devices.
      await win.hide();
      await new Promise<void>((resolve) => setTimeout(resolve, 180));
      const { format, quality } = await readCapturePreferences();
      await ipc.captureFullscreen(format, quality);
      await load();
      setToast(t("Full-screen screenshot saved."));
    } catch (e) {
      console.error("Local full-screen capture error", e);
      setToast(t("Screen capture failed. Open Diagnostics for details."));
    } finally {
      await win.show().catch(console.error);
      await win.setFocus().catch(console.error);
      setCaptureBusy(false);
    }
  };
  const importFromClipboard = async () => {
    if (captureBusy) return;
    setCaptureBusy(true);
    try {
      await ipc.importClipboardImage();
      await load();
      setToast(clipboardText.saved);
    } catch (error) {
      console.error("User-initiated clipboard import failed", error);
      setToast(clipboardText.failed);
    } finally {
      setCaptureBusy(false);
    }
  };

  const recordArea = async () => {
    try {
      await getCurrentWindow().hide();
      await ipc.beginRegionCapture("record");
    } catch (e) {
      await getCurrentWindow().show().catch(console.error);
      console.error("Local recording error", e);
      setToast(t("Recording could not start. Open Diagnostics for details."));
    }
  };
  const openCaptureFolder = async () => {
    try {
      await ipc.openCaptureFolder();
    } catch (error) {
      console.error("Local capture folder open error", error);
      setToast(t("Cannot open capture folder:"));
    }
  };
  const openSettings = async () => {
    try {
      const existing = await WebviewWindow.getByLabel("settings");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }
      const settingsWindow = new WebviewWindow("settings", {
        url: "index.html#settings",
        title: `Snapvere — ${t("Settings")}`,
        width: 860,
        height: 660,
        center: true,
      });
      // WebView2 creation errors are asynchronous; never leave a rejected
      // event registration or a silent failure after clicking Settings.
      void settingsWindow.once("tauri://error", (event) => {
        console.error("Could not open Settings", event.payload);
        setToast(t("Could not load settings:"));
      }).catch((error) => {
        console.error("Settings window error listener failed", error);
      });
    } catch (error) {
      console.error("Cannot open Settings", error);
      setToast(t("Could not load settings:"));
    }
  };

  return (
    <WindowFrame title={APP_NAME}>
      {/* Keep native capture commands unchanged; only their visual priority changes. */}
      <header className="snapvere-workspace-header shrink-0 px-5 pb-5 pt-5">
        <div className="snapvere-workspace-heading">
          <div className="min-w-0">
            <p className="snapvere-section-eyebrow">SNAPVERE</p>
            <h1 className="snapvere-workspace-title">{t("Capture what matters.")}</h1>
            <p className="snapvere-workspace-subtitle">
              {t("Capture, record, and annotate your screen.")}
            </p>
          </div>
          <button
            type="button"
            onClick={openSettings}
            aria-label={t("Settings")}
            className="snapvere-btn-secondary snapvere-workspace-settings"
          >
            <SettingsIcon size={17} aria-hidden="true" />
            <span>{t("Settings")}</span>
          </button>
        </div>
        <div role="group" aria-label={t("Capture actions")} className="snapvere-workspace-actions">
          <button
            type="button"
            aria-label={t("Capture region")}
            disabled={captureBusy}
            onClick={captureRegion}
            className="snapvere-action-card snapvere-action-card--primary"
          >
            <span className="snapvere-action-icon"><Crop size={21} aria-hidden="true" /></span>
            <span className="snapvere-action-copy">
              <strong>{t("Capture region")}</strong>
              <small>{t("Choose exactly what to show")}</small>
            </span>
            <ArrowUpRight className="snapvere-action-arrow" size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("Record screen")}
            disabled={captureBusy}
            onClick={recordArea}
            className="snapvere-action-card"
          >
            <span className="snapvere-action-icon"><Video size={21} aria-hidden="true" /></span>
            <span className="snapvere-action-copy">
              <strong>{t("Record screen")}</strong>
              <small>{t("Capture motion and audio")}</small>
            </span>
            <ArrowUpRight className="snapvere-action-arrow" size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("Full screen")}
            disabled={captureBusy}
            onClick={captureFull}
            className="snapvere-action-card"
          >
            <span className="snapvere-action-icon"><Monitor size={21} aria-hidden="true" /></span>
            <span className="snapvere-action-copy">
              <strong>{captureBusy ? t("Capturing…") : t("Full screen")}</strong>
              <small>{t("Save the entire display")}</small>
            </span>
            <ArrowUpRight className="snapvere-action-arrow" size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="snapvere-gallery-controls shrink-0 px-5 py-4" aria-label={t("Gallery controls")}>
        <div className="snapvere-gallery-overview">
          <p className="snapvere-section-eyebrow">{t("Library")}</p>
          <h2 className="snapvere-gallery-title">{t("Your captures")}</h2>
          <p className="snapvere-gallery-count" aria-live="polite">
            {loading ? t("Updating…") : `${visible.length}${hasMore ? "+" : ""} ${t(visible.length === 1 ? "item loaded" : "items loaded")}`}
          </p>
        </div>
        <div className="snapvere-gallery-tools">
          <div className="snapvere-gallery-search relative">
            <Search size={16} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={searchInput}
              type="search"
              aria-keyshortcuts="Control+F Meta+F"
              value={query}
              onChange={(e) => {
                // Invalidate synchronously, before the 200 ms query debounce.
                galleryRequest.current += 1;
                invalidatePaging();
                loadedItems.current = [];
                activeSelection.setQuery(e.target.value);
                setQuery(e.target.value);
                setGalleryError(false);
                setItems([]);
                setLoading(true);
                setHasMore(false);
                pageOffset.current = 0;
              }}
              placeholder={t("Search names and tags…")}
              maxLength={128}
              aria-label={t("Search names and tags…")}
              className="w-full rounded-full bg-elevated/80 py-2.5 pl-10 pr-4 text-sm outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-accent"
            />
          </div>
          <div role="group" aria-label={t("Filter gallery")} className="snapvere-gallery-filters">
            {(["all", "images", "videos"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  if (activeSelection.snapshot().filter === f) return;
                  galleryRequest.current += 1;
                  invalidatePaging();
                  loadedItems.current = [];
                  activeSelection.setFilter(f);
                  setFilter(f);
                  setGalleryError(false);
                  setItems([]);
                  setLoading(true);
                  setHasMore(false);
                  pageOffset.current = 0;
                }}
                aria-pressed={filter === f}
                className={`snapvere-gallery-filter ${filter === f ? "is-active" : ""}`}
              >
                {t(f === "all" ? "All" : f === "images" ? "Images" : "Videos")}
              </button>
            ))}
          </div>
          <div className="snapvere-gallery-actions">
            {IS_PRO && (
              <button type="button"
                onClick={() => { setProBatchMode((prev) => !prev); setProSelected(new Set()); }}
                aria-pressed={proBatchMode}
                className="snapvere-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
              >
                {proBatchMode ? proText.done : proText.select}
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label={galleryText.refresh}
              aria-keyshortcuts="F5"
              title={galleryText.refresh}
              className="snapvere-btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void openCaptureFolder()}
              aria-label={t("Open capture folder")}
              title={t("Open capture folder")}
              className="snapvere-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
            >
              <FolderOpen size={16} aria-hidden="true" />
              <span>{t("Open capture folder")}</span>
            </button>
            <button
              type="button"
              onClick={() => void importFromClipboard()}
              disabled={captureBusy}
              aria-label={clipboardText.action}
              title={clipboardText.action}
              className="snapvere-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm disabled:opacity-50"
            >
              <ClipboardPaste size={16} aria-hidden="true" />
              <span>{clipboardText.action}</span>
            </button>
          </div>
        </div>
      </section>

      {IS_PRO && proBatchMode && (
        <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-elevated/85 px-4 py-3 text-sm">
          <span className="mr-auto font-medium" aria-live="polite">{proText.count(proSelected.size)}</span>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm"
            disabled={proExportBusy || visible.length === 0}
            onClick={() => setProSelected(current => selectProBatch(current, visible, "all"))}>{proText.selectLoaded}</button>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm"
            disabled={proExportBusy || visible.length === 0}
            onClick={() => setProSelected(current => selectProBatch(current, visible, "images"))}>{proText.imagesOnly}</button>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm"
            disabled={proExportBusy || visible.length === 0}
            onClick={() => setProSelected(current => selectProBatch(current, visible, "videos"))}>{proText.videosOnly}</button>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm"
            disabled={proExportBusy || visible.length === 0}
            onClick={() => setProSelected(current => selectProBatch(current, visible, "invert"))}>{proText.invert}</button>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm"
            disabled={proExportBusy || proSelected.size === 0}
            onClick={() => setProSelected(new Set())}>{proText.clear}</button>
          <button type="button" className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm font-semibold"
            disabled={proExportBusy || proSelected.size === 0}
            onClick={() => void exportProSelection()}>
            {proExportBusy ? proText.exporting : proText.export}
          </button>
        </div>
      )}
      {/* Keep older results visible after a failed refresh, but clearly label
          them as stale and provide an explicit retry action. */}
      {galleryError && visible.length > 0 && (
        <div role="alert" className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-elevated/85 px-4 py-3 text-sm">
          <span>{t("Could not load the gallery")}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="snapvere-btn-secondary rounded-full px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent"
          >
            {galleryText.retry}
          </button>
        </div>
      )}
      {/* galerija */}
      <main className="min-h-0 flex-1 overflow-auto px-5 pb-5">
        {loading && items.length === 0 ? (
          <div className="grid h-full place-items-center text-muted">{t("Loading…")}</div>
        ) : galleryError && visible.length === 0 ? (
          <div role="alert" className="grid h-full place-items-center text-center">
            <div className="max-w-sm">
              <p className="mb-4 text-sm text-muted">{t("Could not load the gallery")}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="snapvere-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-accent"
              >
                {galleryText.retry}
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <EmptyGallery onCapture={captureRegion} hasQuery={!!query.trim() || filter !== "all"} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((s) => (
              <CaptureCard
                key={s.id}
                shot={s}
                onOpen={() => setViewId(s.id)}
                onReveal={() => void reveal(s)}
                onCopyPath={() => void copyPath(s)}
                onDelete={() => void onDelete(s)}
                selected={proSelected.has(s.id)}
                onToggleSelect={IS_PRO && proBatchMode ? () => toggleProItem(s.id) : undefined}
                selectLabel={proText.select}
              />
            ))}
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center pt-5">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore || loading}
              aria-label={t("Load more captures")}
              className="snapvere-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition hover:bg-elevated disabled:opacity-60"
            >
              {loadingMore ? t("Loading…") : t("Load more captures")}
            </button>
          </div>
        )}
      </main>

      <UpdateNotice mode="home" onAction={openSettings} raised={toast !== null} />

      {viewId && (
        <Viewer
          items={visible}
          id={viewId}
          onNavigate={setViewId}
          onClose={closeViewer}
          onDelete={onDelete}
          onToast={setToast}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-elevated/95 px-4 py-2 text-sm shadow-card ring-1 ring-white/10 animate-pop">
          {toast}
        </div>
      )}
    </WindowFrame>
  );
}
