// Snapvere by Brendigo
import type { AppSettings } from "../windows/settings/preferences.ts";
import { normalizeSettings } from "../windows/settings/preferences.ts";
export const PRO_PROFILE_KEY = "proRecordingProfilesV1";
export const PROFILE_KEYS = ["recordFormat", "recordFps", "recordQuality", "recordCursor", "recordMic", "recordSystemAudio", "recordMaxSeconds"] as const;
export type Profile = Pick<AppSettings, (typeof PROFILE_KEYS)[number]>;
export type PresetName = "tutorial" | "presentation" | "compact";
export function safeProfile(raw: unknown, linux = false): Profile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!["gif", "mp4"].includes(obj.recordFormat as string) ||
      ![15, 24, 30, 60].includes(obj.recordFps as number) ||
      typeof obj.recordQuality !== "number" || !Number.isFinite(obj.recordQuality) ||
      obj.recordQuality < 30 || obj.recordQuality > 100 ||
      ![0, 300, 1800, 7200].includes(obj.recordMaxSeconds as number) ||
      ["recordCursor", "recordMic", "recordSystemAudio"].some(k => typeof obj[k] !== "boolean")) return null;
  const s = normalizeSettings(obj);
  const profile = Object.fromEntries(PROFILE_KEYS.map(k => [k, s[k]])) as Profile;
  if (linux) { profile.recordFormat = "gif"; profile.recordCursor = false; }
  if (profile.recordFormat === "gif") { profile.recordMic = false; profile.recordSystemAudio = false; }
  return profile;
}
export function profileSlots(raw: unknown): (Profile | null)[] {
  const entries = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 3 }, (_, i) => safeProfile(entries[i]));
}
export function presetProfile(name: PresetName, linux = false): Profile {
  const settings: Record<PresetName, Partial<Profile>> = {
    tutorial: { recordFormat:"mp4",recordFps:30,recordQuality:95,recordCursor:true,recordMic:true,recordSystemAudio:false,recordMaxSeconds:1800 },
    presentation: { recordFormat:"mp4",recordFps:24,recordQuality:85,recordCursor:true,recordMic:false,recordSystemAudio:false,recordMaxSeconds:7200 },
    compact: { recordFormat:"gif",recordFps:15,recordQuality:45,recordCursor:false,recordMic:false,recordSystemAudio:false,recordMaxSeconds:300 },
  };
  return safeProfile({ ...normalizeSettings(null), ...settings[name] }, linux)!;
}
