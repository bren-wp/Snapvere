// Snapvere by Brendigo
// Typed wrapperi oko Tauri `invoke`. Jedina dodirna točka frontenda i Rust jezgre.
// Tauri v2 automatski mapira camelCase (JS) → snake_case (Rust) argumente.

import { invoke } from "@tauri-apps/api/core";
import type { CapturePreferences } from "./capturePreferences";
import type { ProExportPreset } from "./proSelection";
import type {
  BatchExportReport,
  CaptureAction,
  ImageFormat,
  LinuxAudioSnapshot,
  MonitorInfo,
  PixelRect,
  PlatformCapabilities,
  RecFrameRect,
  RecordOptions,
  RecordStatus,
  Region,
  LogicalRecordingSelection,
  Screenshot,
} from "./types";

export type PreviewMark = {
  kind: "rectangle" | "mask" | "ellipse" | "line" | "arrow" | "pen" | "marker" | "text" | "step";
  rect: PixelRect;
  points?: { x: number; y: number }[];
  glyph?: number[];
  style?: { rgb: [number, number, number]; width: number; opacity: number };
};
export type CropPreview = {
  session: string;
  width: number;
  height: number;
  remaining: number;
  undoCount: number;
  redoCount: number;
  frameId: number;
  timestamp100ns: number;
  revision: number;
  captureToSampleUs: number;
  encoderToSampleUs: number;
  sampleAgeUs: number;
};

export const ipc = {
  // Language preferences are read-only to non-settings windows.
  getAppLanguage: () => invoke<string>("get_app_language"),
  getPlatformCapabilities: () => invoke<PlatformCapabilities>("get_platform_capabilities"),
  listLinuxAudioDevices: () => invoke<LinuxAudioSnapshot | null>("list_linux_audio_devices"),
  selectLinuxAudioDevices: (cookie: number, microphone: string | null, monitor: string | null) =>
    invoke<void>("select_linux_audio_devices", { cookie, microphone, monitor }),
  setAppLanguage: (language: string) =>
    invoke<void>("set_app_language", { language }),
  // ── least-privilege settings snapshots ──
  readCapturePreferences: () => invoke<CapturePreferences>("get_capture_preferences"),
  getOverlayRecordingPreferences: () =>
    invoke<{ recordMic: boolean; recordSystemAudio: boolean; recordFormat: "mp4" | "gif" }>(
      "get_overlay_recording_preferences",
    ),
  setOverlayAudioPreference: (key: "recordMic" | "recordSystemAudio", enabled: boolean) =>
    invoke<void>("set_overlay_audio_preference", { key, enabled }),
  // ── capture ──
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  beginRegionCapture: (mode: "shot" | "record" = "shot") =>
    invoke<void>("begin_region_capture", { mode }),
  getFrozenFrame: (monitorId: number) =>
    invoke<string>("get_frozen_frame", { monitorId }),
  getFrozenRgba: (monitorId: number) =>
    invoke<ArrayBuffer>("get_frozen_rgba", { monitorId }),
  finishRegionCapture: (
    region: Region,
    action: CaptureAction,
    format: ImageFormat,
    quality: number,
  ) =>
    invoke<Screenshot | null>("finish_region_capture", {
      region,
      action,
      format,
      quality,
    }),
  cancelCapture: () => invoke<void>("cancel_capture"),
  /** Overlay se prikazuje cloakan (DWM) — otkrij ga kad je novi frame iscrtan. */
  revealOverlay: () => invoke<void>("reveal_overlay"),
  captureFullscreen: (format: ImageFormat, quality: number) =>
    invoke<Screenshot>("capture_fullscreen", { format, quality }),

  // ── snimanje ekrana ──
  startRecording: (
    region: Region | null,
    monitorId?: number,
    options?: Partial<RecordOptions>,
    logicalSelection?: LogicalRecordingSelection,
  ) =>
    invoke<RecordStatus>("start_recording", { region, monitorId, options, logicalSelection }),
  stopRecording: () => invoke<void>("stop_recording"),
  cancelRecording: () => invoke<void>("cancel_recording"),
  pauseRecording: (paused: boolean) =>
    invoke<RecordStatus>("pause_recording", { paused }),
  recordingStatus: () => invoke<RecordStatus>("recording_status"),
  getCropPreview: () => invoke<CropPreview>("get_crop_preview"),
  getCropPreviewPacket: (session: string, after: number) =>
    invoke<ArrayBuffer>("get_crop_preview_packet", { session, after }),
  acknowledgeCropPreview: (session: string, frameId: number) =>
    invoke<number>("acknowledge_crop_preview", { session, frameId }),
  resumeCropPreview: (session: string, marks: PreviewMark[], historyDelta: number) =>
    invoke<RecordStatus>("resume_crop_preview", { session, marks, historyDelta }),
  closeRecHud: () => invoke<void>("close_rec_hud"),
  /** Expand the native HUD viewport to show its palette/error, then shrink. */
  setRecHudExpanded: (expanded: boolean) =>
    invoke<void>("set_rec_hud_expanded", { expanded }),
  /** Snimano područje za okvir (null izvan snimanja). */
  recFrameRect: () => invoke<RecFrameRect | null>("rec_frame_rect"),
  /** true = sloj za crtanje hvata miš; false = klikovi prolaze kroz njega. */
  setDrawInteractive: (interactive: boolean) =>
    invoke<void>("set_draw_interactive", { interactive }),
  /** Redact zone koje Rust pikselizira u svakom frameu snimke. */
  setBlurRegions: (rects: PixelRect[], viewportWidth: number, viewportHeight: number) =>
    invoke<void>("set_blur_regions", { rects, viewportWidth, viewportHeight }),

  // ── editor ──
  saveEditedImage: (base64Png: string, format: ImageFormat, quality: number) =>
    invoke<Screenshot>("save_edited_image", { base64Png, format, quality }),
  /** Rust opens the OS Save As picker. True = exported; false = user cancelled. */
  saveImageAs: (base64Png: string, format: ImageFormat, quality: number) =>
    invoke<boolean>("save_image_as", { base64Png, format, quality }),
  copyBase64ToClipboard: (base64Png: string) =>
    invoke<void>("copy_base64_to_clipboard", { base64Png }),
  /** Import the PNG the user explicitly copied from a browser extension. */
  importClipboardImage: () =>
    invoke<Screenshot>("import_clipboard_image"),

  // ── galerija ──
  listScreenshots: (limit?: number, offset?: number, kind?: "all" | "images" | "videos") =>
    invoke<Screenshot[]>("list_screenshots", { limit, offset, kind }),
  searchScreenshots: (query: string, limit?: number, offset?: number, kind?: "all" | "images" | "videos") =>
    invoke<Screenshot[]>("search_screenshots", { query, limit, offset, kind }),
  deleteScreenshot: (id: string) =>
    invoke<void>("delete_screenshot", { id }),
  addTag: (id: string, tag: string) => invoke<void>("add_tag", { id, tag }),

  // ── preglednik (po id-u zapisa, ne po putanji) ──
  /** Otvori u zadanom programu sustava. */
  openMedia: (id: string) => invoke<void>("open_media", { id }),
  /** Pokaži datoteku u Exploreru. */
  revealMedia: (id: string) => invoke<void>("reveal_media", { id }),
  copyMediaImage: (id: string) => invoke<void>("copy_media_image", { id }),
  copyMediaPath: (id: string) => invoke<void>("copy_media_path", { id }),
  /** Pro native builds only: bounded, ID-based, user-approved local folder export. */
  proExportBatch: (ids: string[], preset: ProExportPreset) =>
    invoke<BatchExportReport>("pro_export_batch", { ids, preset }),

  // ── sustav ──
  showHome: () => invoke<void>("show_home"),
  updateHotkey: (accelerator: string) =>
    invoke<void>("update_hotkey", { accelerator }),
  updateRecordHotkey: (accelerator: string) =>
    invoke<void>("update_record_hotkey", { accelerator }),
  /** [capture, record] — stvarno registrirani hotkeyi (default može pasti na fallback). */
  activeHotkeys: () => invoke<[string | null, string | null]>("active_hotkeys"),
  logFilePath: () => invoke<string | null>("log_file_path"),
  openCaptureFolder: () => invoke<void>("open_capture_folder"),
  openDataFolder: () => invoke<void>("open_data_folder"),
};
