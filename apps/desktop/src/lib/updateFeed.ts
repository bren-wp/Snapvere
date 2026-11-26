// Snapvere by Brendigo
/**
 * Public, privacy-preserving update *notification* for the Tauri/Rust edition.
 * No installers are downloaded or executed by the WebView. The only permitted
 * network request is a user-triggered or explicitly opted-in GET for a version
 * manifest at update.snapvere.com; startup is offline by default.
 */
export const UPDATE_FEED_URL = "https://update.snapvere.com/stable.json";
export const OFFICIAL_DOWNLOAD_URL = "https://snapvere.com/download/tauri/";
export const UPDATE_PRODUCT = "snapvere-tauri-windows";
/** A Windows-only release feed must never advertise Windows installers on Linux. */
export function canCheckWindowsUpdates(os: string | null): boolean {
  return os === "windows";
}
const MAX_MANIFEST_BYTES = 8192;
const TIMEOUT_MS = 6500;

type Version = readonly [number, number, number];
export type UpdateTarget = Readonly<{ os: "windows" | "linux"; edition: "free" | "pro" }>;
export type UpdatePackage = Readonly<{ name: string; size: number; sha256: string }>;
export type AvailableUpdate = Readonly<{ version: string; notes: string; packages?: readonly UpdatePackage[] }>;
export function updateTarget(os: string | null, pro: boolean): UpdateTarget | null {
  return os === "windows" || os === "linux" ? { os, edition: pro ? "pro" : "free" } : null;
}
export function packageNames(target: UpdateTarget): string[] {
  const prefix = target.edition === "pro" ? "Snapvere-Pro" : "Snapvere";
  return target.os === "windows"
    ? ["-Setup.exe", "-Setup.msi", "-Portable.exe"].map(s => prefix+s)
    : ["-Linux-amd64.deb", "-Linux-x86_64.AppImage"].map(s => prefix+s);
}
export function updateDownloadUrl(version: string, name: string, target: UpdateTarget): string {
  if (!parseVersion(version) || !packageNames(target).includes(name)) throw new Error("Invalid update package");
  return "https://update.snapvere.com/download.php?" + new URLSearchParams({version, package:name}).toString();
}

export function parseVersion(value: string): Version | null {
  if (value.length > 20) return null;
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(value);
  if (!match || match[0] !== value) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n) || n > 999999)) return null;
  return parts as unknown as Version;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

/** Server data is only plain text and never controls an external URL. */
export function parseUpdateManifest(raw: unknown, currentVersion: string, target?: UpdateTarget): AvailableUpdate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid update manifest");
  }
  const record = raw as Record<string, unknown>;
  if (record.product !== UPDATE_PRODUCT || typeof record.version !== "string" ||
      !parseVersion(record.version)) {
    throw new Error("Update manifest does not describe the official Windows edition");
  }
  if (record.download_url !== undefined && record.download_url !== OFFICIAL_DOWNLOAD_URL) {
    throw new Error("Update manifest contains a nonofficial download address");
  }
  if (record.notes !== undefined &&
      (typeof record.notes !== "string" || record.notes.length > 800)) {
    throw new Error("Update release notes are invalid");
  }
  if (!isNewerVersion(record.version, currentVersion)) return null;
  const result = { version: record.version, notes: (record.notes as string | undefined) ?? "" };
  if (!target) return result;
  if (!Array.isArray(record.packages) || record.packages.length !== 10 || record.channel !== "stable") {
    throw new Error("No verified package catalog");
  }
  const names = new Set([
    ...packageNames({os:"windows",edition:"free"}), ...packageNames({os:"windows",edition:"pro"}),
    ...packageNames({os:"linux",edition:"free"}), ...packageNames({os:"linux",edition:"pro"}),
  ]);
  const packages: UpdatePackage[] = [];
  for (const rawPackage of record.packages) {
    if (!rawPackage || typeof rawPackage !== "object" || Array.isArray(rawPackage)) throw new Error("Invalid package");
    const item = rawPackage as Record<string, unknown>;
    if (typeof item.name !== "string" || !names.delete(item.name) ||
        typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 1000000 ||
        typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error("Invalid package");
    packages.push({name:item.name,size:item.size,sha256:item.sha256});
  }
  const matching = packageNames(target).map(name => packages.find(item => item.name === name)!);
  return {...result, packages:matching};
}

/**
 * Limit response bytes while streaming: checking only text.length *after*
 * response.text() would let a malicious endpoint allocate a huge payload.
 */
async function readManifestBounded(response: Response): Promise<string> {
  if (!response.body) throw new Error("Empty update response");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_MANIFEST_BYTES);
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_MANIFEST_BYTES - size) {
        void reader.cancel().catch(() => {});
        throw new Error("Update manifest is too large");
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
}

export async function checkForUpdates(
  currentVersion: string,
  cancelSignal?: AbortSignal,
  target?: UpdateTarget,
): Promise<AvailableUpdate | null> {
  if (!parseVersion(currentVersion)) throw new Error("Invalid installed version");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (cancelSignal?.aborted) controller.abort();
  else cancelSignal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, TIMEOUT_MS);
  try {
    const response = await fetch(UPDATE_FEED_URL, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
      referrerPolicy: "no-referrer", signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Update check unavailable");
    const bytes = response.headers.get("content-length");
    if (bytes !== null && (!/^\d+$/.test(bytes) || !Number.isSafeInteger(Number(bytes)))) {
      throw new Error("Invalid update content length");
    }
    if (bytes !== null && Number(bytes) > MAX_MANIFEST_BYTES) {
      throw new Error("Update manifest is too large");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      throw new Error("Unexpected update response");
    }
    const text = await readManifestBounded(response);
    return parseUpdateManifest(JSON.parse(text) as unknown, currentVersion, target);
  } finally {
    controller.abort();
    clearTimeout(timeout);
    cancelSignal?.removeEventListener("abort", abort);
  }
}

/** Only a different, newer release may re-open a dismissed corner notice. */
export function shouldShowReleaseNotice(
  available: AvailableUpdate | null,
  dismissedVersion: string | null,
): boolean {
  return available !== null && available.version !== dismissedVersion;
}

/** Update checks are strictly opt-in, even for missing/invalid legacy preferences. */
export function autoUpdateChecksEnabled(value: string | null): boolean {
  return value === "true";
}
