import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Monitor,
  Settings as SettingsIcon,
  Search,
  Video,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { useLanguage } from "../lib/LanguageProvider";
import { isVideo } from "../lib/types";
import { mergeUniqueById } from "../lib/galleryPaging";
import type { RecordDone, Screenshot } from "../lib/types";
import WindowFrame from "../components/WindowFrame";
import Viewer from "../components/Viewer";
import CaptureCard from "../components/home/CaptureCard";
import EmptyGallery from "../components/home/EmptyGallery";
import UpdateNotice from "../components/UpdateNotice";

type Filter = "all" | "images" | "videos";
const PAGE_SIZE = 120;

export default function Home() {
  const { t, language } = useLanguage();
  const clipboardText = clipboardImportCopy(language);
  const [items, setItems] = useState<Screenshot[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  /** Otvoren u pregledniku (id, ne indeks — lista se osvježava ispod njega). */
  const [viewId, setViewId] = useState<string | null>(null);
  const galleryRequest = useRef(0);
  const pagingBusy = useRef(false);
  const pageOffset = useRef(0);

  const load = useCallback(async (q: string) => {
    const request = ++galleryRequest.current;
    setLoading(true);
    try {
      const res = q.trim()
        ? await ipc.searchScreenshots(q, PAGE_SIZE, 0)
        : await ipc.listScreenshots(PAGE_SIZE, 0);
      if (request === galleryRequest.current) {
        pageOffset.current = res.length;
        setItems(res);
        setHasMore(res.length === PAGE_SIZE);
      }
    } catch (e) {
      console.error(e);
      if (request === galleryRequest.current) setToast(t("Could not load the gallery"));
    } finally {
      if (request === galleryRequest.current) setLoading(false);
    }
  }, [t]);

  const loadMore = useCallback(async () => {
    if (pagingBusy.current || loading || !hasMore) return;
    pagingBusy.current = true;
    const request = galleryRequest.current;
    const offset = pageOffset.current;
    setLoadingMore(true);
    try {
      const res = query.trim()
        ? await ipc.searchScreenshots(query, PAGE_SIZE, offset)
        : await ipc.listScreenshots(PAGE_SIZE, offset);
      if (request !== galleryRequest.current) return;
      pageOffset.current = offset + res.length;
      setItems((previous) => mergeUniqueById(previous, res));
      setHasMore(res.length === PAGE_SIZE);
    } catch (error) {
      if (request === galleryRequest.current) {
        setToast(`${t("Could not load older captures:")} ${String(error)}`);
      }
    } finally {
      pagingBusy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(query), 200);
    return () => {
      clearTimeout(t);
      galleryRequest.current += 1;
    };
  }, [query, load]);

  useEffect(() => {
    const w = getCurrentWindow();
    const un = w.onFocusChanged(({ payload }) => {
      if (payload) void load(query);
    });
    return () => void un.then((f) => f());
  }, [load, query]);

  // Snimanje i tray-capture zavrsavaju izvan ovog prozora — event je jedini signal.
  useEffect(() => {
    const subs = [
      listen<RecordDone>("snapvere:rec-done", (e) => {
        const { error, cancelled } = e.payload;
        if (error) setToast(`${t("Recording failed:")} ${error}`);
        else if (!cancelled) {
          setToast(t("Recording saved"));
          void load(query);
        }
      }),
      listen<Screenshot>("snapvere:shot-saved", () => void load(query)),
      listen<string>("snapvere:toast", (e) => setToast(e.payload)),
    ];
    return () => {
      subs.forEach((x) => void x.then((un) => un()));
    };
  }, [load, query, t]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    const wantVideo = filter === "videos";
    return items.filter((s) => isVideo(s) === wantVideo);
  }, [items, filter]);

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
      setItems((prev) => prev.filter((x) => x.id !== s.id));
      return true;
    } catch (e) {
      setToast(`${t("Could not delete capture:")} ${String(e)}`);
      return false;
    }
  }, [t]);

  const reveal = useCallback(async (s: Screenshot) => {
    try {
      await ipc.revealMedia(s.id);
    } catch (e) {
      setToast(String(e));
    }
  }, []);

  const closeViewer = useCallback(() => setViewId(null), []);

  const captureRegion = async () => {
    try {
      await getCurrentWindow().hide();
      await ipc.beginRegionCapture();
    } catch (e) {
      await getCurrentWindow().show().catch(console.error);
      setToast(`${t("Capture could not start:")} ${String(e)}`);
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
      await load(query);
      setToast(t("Full-screen screenshot saved."));
    } catch (e) {
      setToast(`${t("Screenshot failed:")} ${String(e)}`);
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
      await load(query);
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
      setToast(`${t("Recording could not start:")} ${String(e)}`);
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
        setToast(`${t("Settings")}: ${String(event.payload)}`);
      }).catch((error) => {
        console.error("Settings window error listener failed", error);
      });
    } catch (error) {
      console.error("Cannot open Settings", error);
      setToast(`${t("Settings")}: ${String(error)}`);
    }
  };

  return (
    <WindowFrame title="Snapvere">
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
        <div className="mt-3"><UpdateNotice mode="home" onAction={openSettings} /></div>
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
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
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
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`snapvere-gallery-filter ${filter === f ? "is-active" : ""}`}
              >
                {t(f === "all" ? "All" : f === "images" ? "Images" : "Videos")}
              </button>
            ))}
          </div>
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
      </section>

      {/* galerija */}
      <main className="min-h-0 flex-1 overflow-auto px-5 pb-5">
        {loading && items.length === 0 ? (
          <div className="grid h-full place-items-center text-muted">{t("Loading…")}</div>
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
                onDelete={() => void onDelete(s)}
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
