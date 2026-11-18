import { Fragment, useEffect, useState, type KeyboardEvent } from "react";
import { SlidersHorizontal, Keyboard, Crop, Video, FolderOpen, ShieldCheck, Info } from "lucide-react";
import { load, type Store } from "@tauri-apps/plugin-store";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { emit } from "@tauri-apps/api/event";
import UpdateNotice from "../components/UpdateNotice";
import { OFFICIAL_DOWNLOAD_URL } from "../lib/updateFeed";
import { ipc } from "../lib/ipc";
import { LANGUAGES, type Language } from "../lib/i18n";
import { useLanguage } from "../lib/LanguageProvider";
import type { ImageFormat, RecordFormat } from "../lib/types";
import WindowFrame from "../components/WindowFrame";
import { DEFAULTS, normalizeSettings, type AppSettings } from "./settings/preferences";
import { Section, Row, Toggle, Segmented, HotkeyInput } from "./settings/SettingsControls";
import { version as appVersion } from "../../package.json";

type Tab =
  | "general"
  | "hotkeys"
  | "capture"
  | "recording"
  | "save"
  | "privacy"
  | "about";

// Match the website's capture-first product story while keeping all existing options.
const TABS: { id: Tab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: "capture", label: "Capture", icon: Crop },
  { id: "recording", label: "Recording", icon: Video },
  { id: "save", label: "Save", icon: FolderOpen },
  { id: "hotkeys", label: "Hotkeys", icon: Keyboard },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "about", label: "About", icon: Info },
];

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  capture: "Choose the format and quality of your screenshots.",
  recording: "Control video quality, audio sources and capture limits.",
  save: "Choose where captures are saved.",
  hotkeys: "Customize keyboard shortcuts for quick capture and recording.",
  general: "Make Snapvere feel right on your desktop.",
  privacy: "Review your privacy and storage controls.",
  about: "Version, product information, licensing and diagnostics.",
};

export default function Settings() {
  const { language, changeLanguage, t } = useLanguage();
  const [tab, setTab] = useState<Tab>("capture");
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [store, setStore] = useState<Store | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const st = await load("settings.json", { autoSave: true, defaults: {} });
      setStore(st);
      // Parallel, bounded reads: a bad/old settings.json must not break the UI.
      const values = await Promise.all(
        (Object.keys(DEFAULTS) as (keyof AppSettings)[]).map(async (key) => [key, await st.get(key)] as const),
      );
      const loaded = normalizeSettings(Object.fromEntries(values));
      // Ako je zeljeni hotkey zauzet, jezgra registrira fallback — prikazi STVARNO stanje.
      try {
        const [capture, record] = await ipc.activeHotkeys();
        if (capture) loaded.hotkey = prettyAccel(capture);
        if (record) loaded.recordHotkey = prettyAccel(record);
      } catch {
        /* noop */
      }
      setS(loaded);
      try {
        setAutostart(await isEnabled());
      } catch {
        /* noop */
      }
    })().catch((error) => setNotice(`${t("Could not load settings:")} ${String(error)}`));
  }, []);

  function set<K extends keyof AppSettings>(key: K, val: AppSettings[K]) {
    if (!store) {
      setNotice(t("Settings are not ready yet. Try again."));
      return;
    }
    setS((prev) => ({ ...prev, [key]: val }));
    void store.set(key, val).catch((error) => setNotice(`${t("Could not save setting:")} ${String(error)}`));
  }

  // Save a hotkey only after the operating system has accepted it. On failure,
  // the native service attempts to restore the previous binding.
  const applyHotkey = async (key: "hotkey" | "recordHotkey", accelerator: string) => {
    setStatus(null);
    try {
      if (key === "hotkey") await ipc.updateHotkey(accelerator);
      else await ipc.updateRecordHotkey(accelerator);
      const [capture, recording] = await ipc.activeHotkeys();
      const active = key === "hotkey" ? capture : recording;
      set(key, prettyAccel(active ?? accelerator));
      setNotice(null);
      setStatus(t(key === "hotkey" ? "Screenshot shortcut updated." : "Recording shortcut updated."));
    } catch (error) {
      const current = await ipc.activeHotkeys().catch(() => null);
      if (current) {
        const previous = key === "hotkey" ? current[0] : current[1];
        if (previous) setS((state) => ({ ...state, [key]: prettyAccel(previous) }));
      }
      setNotice(`${t("Shortcut was not changed:")} ${String(error)}`);
    }
  };

  const applyTheme = (theme: "dark" | "light") => {
    if (!store) {
      setNotice(t("Settings are not ready yet. Try again."));
      return;
    }
    set("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("snapvere-theme", theme);
    } catch {
      setNotice(t("Theme could not be saved."));
    }
    void emit("snapvere:theme-changed", theme).catch((error) => {
      console.error("Could not notify other windows of theme change", error);
    });
  };

  const toggleAutostart = async (on: boolean) => {
    if (!store) {
      setNotice(t("Settings are not ready yet. Try again."));
      return;
    }
    const previous = autostart;
    try {
      if (on) await enable();
      else await disable();
      // Persist only after the OS has accepted the change.
      await store.set("autostart", on);
      setAutostart(on);
      setNotice(null);
    } catch (error) {
      // Keep actual Windows startup and settings in sync on partial failure.
      try {
        if (previous) await enable();
        else await disable();
      } catch (restoreError) {
        setNotice(`${t("Could not restore startup:")} ${String(restoreError)}`);
        return;
      }
      setAutostart(previous);
      setNotice(`${t("Could not change startup preference:")} ${String(error)}`);
    }
  };

  const pickFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false });
      if (typeof dir === "string") set("saveFolder", dir);
    } catch (error) {
      setNotice(`${t("Could not select capture folder:")} ${String(error)}`);
    }
  };

  // Arrow keys navigate only the settings sidebar, never hotkey input fields.
  const onSidebarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-settings-tab]");
    if (!button) return;
    const current = TABS.findIndex((item) => item.id === button.dataset.settingsTab);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (current + 1) % TABS.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (current - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].id);
    setNotice(null);
    setStatus(null);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]")[next]?.focus();
  };

  return (
    <WindowFrame title="Settings">
      <div className="snapvere-settings-layout flex min-h-0 flex-1">
        <nav
          aria-label={t("Settings")}
          onKeyDown={onSidebarKeyDown}
          className="snapvere-settings-sidebar flex w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/10 bg-elevated/20 p-3"
        >
          {TABS.map((item, index) => (
            <Fragment key={item.id}>
              {(index === 0 || index === 4) && (
                <div className="snapvere-section-eyebrow snapvere-settings-group-label">
                  {index === 0 ? t("Capture tools") : t("Application")}
                </div>
              )}
              <button
                type="button"
                data-settings-tab={item.id}
                onClick={() => { setTab(item.id); setNotice(null); setStatus(null); }}
                aria-current={tab === item.id ? "page" : undefined}
                aria-label={`${t(item.label)} ${language === "en" ? "settings" : t("Settings")}`}
                className={`snapvere-settings-tab flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                  tab === item.id ? "bg-accent text-white" : "text-muted hover:bg-elevated hover:text-text"
                }`}
              >
                <item.icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                <span>{t(item.label)}</span>
              </button>
            </Fragment>
          ))}
        </nav>

        <div className="snapvere-settings-content min-h-0 flex-1 overflow-auto p-6">
          <div className="snapvere-settings-heading">
            <p className="snapvere-section-eyebrow">{t("PREFERENCES")} / {t(TABS.find((item) => item.id === tab)?.label ?? tab).toLocaleUpperCase(language)}</p>
            <p>{t(TAB_DESCRIPTIONS[tab])}</p>
          </div>
          {notice && <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">{notice}</p>}
          {status && <p role="status" aria-live="polite" className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">{status}</p>}
        {tab === "general" && (
          <Section title={t("General")}>
            <Row label={t("Theme")} hint={t("Light or dark interface scheme.")}>
              <Segmented
                value={s.theme}
                options={[
                  { v: "dark", l: t("Dark") },
                  { v: "light", l: t("Light") },
                ]}
                onChange={(v) => applyTheme(v as "dark" | "light")}
              />
            </Row>
            <Row label={t("Language")} hint={t("Choose the interface language.")}>
              <select
                value={language}
                aria-label={t("Language")}
                onChange={(event) => {
                  void changeLanguage(event.target.value as Language)
                    .catch((error) => setNotice(`${t("Could not change language:")} ${String(error)}`));
                }}
                className="min-w-44 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent"
              >
                {LANGUAGES.map(({ code, label }) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </Row>
            <Row
              label={t("Launch on startup")}
              hint={t("Start Snapvere when you sign in (off by default).")}
            >
              <Toggle label={t("Launch on startup")} checked={autostart} onChange={toggleAutostart} />
            </Row>
          </Section>
        )}

        {tab === "hotkeys" && (
          <Section title={t("Hotkeys")}>
            <Row label={t("Region capture")} hint={t("Select an area of the screen.")}>
              <HotkeyInput
                label={t("Screenshot shortcut")}
                value={s.hotkey}
                onChange={(accel) => void applyHotkey("hotkey", accel)}
              />
            </Row>
            <Row
              label={t("Screen recording")}
              hint={t("Choose an area and use the shortcut again to stop recording.")}
            >
              <HotkeyInput
                label={t("Recording shortcut")}
                value={s.recordHotkey}
                onChange={(accel) => void applyHotkey("recordHotkey", accel)}
              />
            </Row>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {t("Click a field and press your shortcut. Changes apply immediately.")}
              <br />
              <span className="text-muted/80">
                {t("The Fn key may be handled by your keyboard. Choose a shortcut Windows can detect.")}
              </span>
            </p>
          </Section>
        )}

        {tab === "capture" && (
          <Section title={t("Capture")}>
            <Row label={t("Default format")} hint={t("Choose the file format for new screenshots.")}>
              <Segmented
                value={s.format}
                options={[
                  { v: "png", l: "PNG" },
                  { v: "jpg", l: "JPG" },
                  { v: "webp", l: "WebP" },
                ]}
                onChange={(v) => set("format", v as ImageFormat)}
              />
            </Row>
            <Row label={`${t("Quality")} (${s.quality})`}>
              <input
                type="range"
                min={50}
                max={100}
                value={s.quality}
                disabled={s.format === "png"}
                onChange={(e) => set("quality", +e.target.value)}
                className="w-48"
              />
            </Row>
            {s.format === "png" && <p className="text-xs text-muted">{t("PNG is lossless; quality does not apply.")}</p>}
          </Section>
        )}

        {tab === "recording" && (
          <Section title={t("Recording")}>
            <Row label={t("Format")} hint={t("MP4 supports video and audio; GIF is silent.")}>
              <Segmented
                value={s.recordFormat}
                options={[
                  { v: "mp4", l: "MP4" },
                  { v: "gif", l: "GIF" },
                ]}
                onChange={(v) => set("recordFormat", v as RecordFormat)}
              />
            </Row>
            <Row label={t("Frame rate")} hint={t("Higher frame rates provide smoother video.")}>
              <Segmented
                value={String(s.recordFps)}
                options={[
                  { v: "15", l: "15" },
                  { v: "24", l: "24" },
                  { v: "30", l: "30" },
                  { v: "60", l: "60" },
                ]}
                onChange={(v) => set("recordFps", Number(v))}
              />
            </Row>
            <Row label={`${t("Quality")} (${s.recordQuality})`} hint={t("Controls the video bitrate.")}>
              <input
                type="range"
                min={30}
                max={100}
                value={s.recordQuality}
                disabled={s.recordFormat === "gif"}
                onChange={(e) => set("recordQuality", +e.target.value)}
                className="w-48"
              />
            </Row>
            <Row label={t("Include the mouse cursor")}>
              <Toggle
                label={t("Include the mouse cursor")}
                checked={s.recordCursor}
                onChange={(v) => set("recordCursor", v)}
              />
            </Row>
            <Row
              label={t("Record microphone")}
              hint={t("Uses the default microphone; adjustable before each recording.")}
            >
              <Toggle
                label={t("Record microphone")}
                checked={s.recordFormat === "mp4" && s.recordMic}
                disabled={s.recordFormat === "gif"}
                onChange={(v) => set("recordMic", v)}
              />
            </Row>
            <Row
              label={t("Record system audio")}
              hint={t("Record sound played by the system (MP4 only).")}
            >
              <Toggle
                label={t("Record system audio")}
                checked={s.recordFormat === "mp4" && s.recordSystemAudio}
                disabled={s.recordFormat === "gif"}
                onChange={(v) => set("recordSystemAudio", v)}
              />
            </Row>
            <Row
              label={t("Stop after")}
              hint={t("Limit recording duration to protect disk space.")}
            >
              <Segmented
                value={String(s.recordMaxSeconds)}
                options={[
                  { v: "300", l: `5 ${t("min")}` },
                  { v: "1800", l: `30 ${t("min")}` },
                  { v: "7200", l: `2 ${t("h")}` },
                  { v: "0", l: t("Never") },
                ]}
                onChange={(v) => set("recordMaxSeconds", Number(v))}
              />
            </Row>
            {s.recordFormat === "gif" && (
              <p className="text-xs text-muted">
                {t("GIF exports are limited to 960 px and 256 colors per frame.")}
              </p>
            )}
          </Section>
        )}

        {tab === "save" && (
          <Section title={t("Save")}>
            <Row label={t("Folder")}>
              <div className="flex items-center gap-2">
                <code className="max-w-xs truncate rounded bg-elevated px-2 py-1 text-xs">{s.saveFolder}</code>
                <button onClick={pickFolder} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-elevated">
                  {t("Change")}
                </button>
              </div>
            </Row>
          </Section>
        )}

        {tab === "privacy" && (
          <Section title={t("Privacy")}>
            <div className="rounded-2xl border border-accent/25 bg-accent/5 p-5">
              <h2 className="text-base font-semibold">{t("Your captures stay on your computer")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t("Screenshots, recordings, and settings stay on your device. No account or upload is required.")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={async () => {
                  try { await ipc.openCaptureFolder(); }
                  catch (error) { setNotice(`${t("Cannot open capture folder:")} ${String(error)}`); }
                }} className="rounded-xl border border-border bg-elevated px-4 py-2 text-sm font-medium hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                  {t("Open capture folder")}
                </button>
                <button type="button" onClick={async () => {
                  try { await ipc.openDataFolder(); }
                  catch (error) { setNotice(`${t("Cannot open data folder:")} ${String(error)}`); }
                }} className="rounded-xl border border-border bg-elevated px-4 py-2 text-sm font-medium hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                  {t("Open data folder")}
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {t("Review and delete captures in the gallery. Closing Snapvere does not delete files.")}
            </p>
          </Section>
        )}

        {tab === "about" && (
          <Section title={t("About")}>
            <p className="text-sm text-muted">Snapvere · {t("Version")} {appVersion}</p>
            <p className="mt-2 text-sm text-muted">
              {t("Screen capture and recording by Brendigo.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className="font-medium text-muted">{t("Developer")}: Brendigo</span>
              <button
                type="button"
                onClick={() => void openUrl("https://snapvere.com/").catch((error) => setNotice(String(error)))}
                className="font-medium text-accent underline-offset-4 hover:underline focus-visible:underline"
                aria-label={t("Open Snapvere website")}
              >
                {t("Official website")}: snapvere.com
              </button>
            </div>
            <div className="mt-4">
              <UpdateNotice mode="settings" onAction={() => {
                void openUrl(OFFICIAL_DOWNLOAD_URL).catch((error) => setNotice(String(error)));
              }} />
            </div>
            <div className="mt-5 rounded-xl border border-border/60 bg-elevated/20 p-4">
              <div className="text-sm font-medium">{t("Commercial license agreement")}</div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {t("Commercial use is permitted. Open-source licenses remain valid. No account or activation key is needed.")}
              </p>
              <button
                type="button"
                onClick={() => void openUrl("https://snapvere.com/license/").catch((error) => setNotice(`${t("Cannot open license:")} ${String(error)}`))}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-elevated focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t("Read license terms")}
              </button>
            </div>
            <div className="mt-6 rounded-xl border border-border/60 p-4">
              <div className="mb-1 text-sm font-medium">{t("Diagnostics")}</div>
              <p className="mb-3 text-xs text-muted">
                {t("Check the log to investigate recording and application errors.")}
              </p>
              <button
                onClick={async () => {
                  try {
                    const path = await ipc.logFilePath();
                    if (path) await openPath(path);
                  } catch (error) {
                    console.error("Cannot open diagnostics log", error);
                    setNotice(String(error));
                  }
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-elevated"
              >
                {t("Open log file")}
              </button>
            </div>
          </Section>
        )}
      </div>
      </div>
    </WindowFrame>
  );
}

/** "CmdOrCtrl+Shift+R" je Taurijev zapis; korisniku pokazujemo tipku koju stvarno pritišće. */
function prettyAccel(accel: string): string {
  const isMac = navigator.userAgent.includes("Mac");
  return accel.replace(/CmdOrCtrl/gi, isMac ? "Cmd" : "Ctrl").replace(/\bSuper\b/g, isMac ? "Cmd" : "Win");
}

