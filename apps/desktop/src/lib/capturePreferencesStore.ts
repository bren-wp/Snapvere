// Snapvere by Brendigo
import { ipc } from "./ipc";
import {
  DEFAULT_CAPTURE_PREFERENCES,
  normalizeCapturePreferences,
  type CapturePreferences,
} from "./capturePreferences";

/**
 * Re-read settings just before saving. Other windows can change preferences
 * while the gallery or editor remains open; stale per-window defaults must not win.
 */
export async function readCapturePreferences(): Promise<CapturePreferences> {
  try {
    const { format, quality } = await ipc.readCapturePreferences();
    return normalizeCapturePreferences(format, quality);
  } catch (error) {
    // Capture/export must remain available if the local settings store fails.
    console.warn("Capture settings unavailable; using PNG defaults", error);
    return { ...DEFAULT_CAPTURE_PREFERENCES };
  }
}
