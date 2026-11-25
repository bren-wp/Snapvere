// Snapvere by Brendigo
import type { GallerySelection } from "./galleryPaging.ts";
import { isProExportPreset, type ProExportPreset } from "./proSelection.ts";

export type SavedCollection = GallerySelection & { name: string };
export type SavedExportProfile = { name: string; preset: ProExportPreset };
export const SAVED_LIMIT = 12;
export const COLLECTION_KEY = "snapvere-pro-collections-v1";
export const EXPORT_PROFILE_KEY = "snapvere-pro-export-profiles-v1";
type Store = Pick<Storage, "getItem" | "setItem">;

function nameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 48 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}
function fields(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function collection(value: unknown): SavedCollection | null {
  const entry = fields(value);
  const name = nameOf(entry?.name);
  if (!entry || !name || typeof entry.query !== "string" || entry.query.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(entry.query) ||
      (entry.filter !== "all" && entry.filter !== "images" && entry.filter !== "videos")) return null;
  return { name, query: entry.query, filter: entry.filter };
}
function profile(value: unknown): SavedExportProfile | null {
  const entry = fields(value);
  const name = nameOf(entry?.name);
  if (!entry || !name || !isProExportPreset(entry.preset)) return null;
  return { name, preset: entry.preset };
}
function read<T extends { name: string }>(key: string, parse: (v: unknown) => T | null, store?: Store): T[] {
  try {
    const json = (store ?? localStorage).getItem(key);
    if (!json || json.length > 8192) return [];
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const names = new Set<string>();
    const result: T[] = [];
    for (const value of raw.slice(0, SAVED_LIMIT)) {
      const entry = parse(value);
      if (entry && !names.has(entry.name)) {
        names.add(entry.name);
        result.push(entry);
      }
    }
    return result;
  } catch { return []; }
}
function write<T extends { name: string }>(key: string, list: T[], store?: Store): T[] {
  (store ?? localStorage).setItem(key, JSON.stringify(list));
  return list;
}
function save<T extends { name: string }>(key: string, entry: T | null, parse: (v: unknown) => T | null, store?: Store): T[] {
  if (!entry) throw new Error("Invalid saved workspace");
  const current = read(key, parse, store);
  if (current.some(item => item.name === entry.name) || current.length >= SAVED_LIMIT) {
    throw new Error("Duplicate name or saved workspace limit");
  }
  return write(key, [...current, entry], store);
}
export const readCollections = (store?: Store) => read(COLLECTION_KEY, collection, store);
export const readExportProfiles = (store?: Store) => read(EXPORT_PROFILE_KEY, profile, store);
export function saveCollection(name: string, selection: GallerySelection, store?: Store) {
  return save(COLLECTION_KEY, collection({ ...selection, name }), collection, store);
}
export function saveExportProfile(name: string, preset: ProExportPreset, store?: Store) {
  return save(EXPORT_PROFILE_KEY, profile({ name, preset }), profile, store);
}
export function deleteCollection(name: string, store?: Store) {
  return write(COLLECTION_KEY, readCollections(store).filter(item => item.name !== name), store);
}
export function deleteExportProfile(name: string, store?: Store) {
  return write(EXPORT_PROFILE_KEY, readExportProfiles(store).filter(item => item.name !== name), store);
}
