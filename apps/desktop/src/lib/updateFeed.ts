// Snapvere by Brendigo
/**
 * Public, privacy-preserving update *notification* for the Tauri/Rust edition.
 * No installers are downloaded or executed by the WebView. The only permitted
 * network request is a GET for a version manifest at update.snapvere.com.
 */
export const UPDATE_FEED_URL = "https://update.snapvere.com/stable.json";
export const OFFICIAL_DOWNLOAD_URL = "https://snapvere.com/download/";
export const UPDATE_PRODUCT = "snapvere-tauri-windows";
const MAX_MANIFEST_BYTES = 8192;
const TIMEOUT_MS = 6500;

type Version = readonly [number, number, number];
export type AvailableUpdate = Readonly<{ version: string; notes: string }>;

export function parseVersion(value: string): Version | null {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(value);
  if (!match) return null;
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
export function parseUpdateManifest(raw: unknown, currentVersion: string): AvailableUpdate | null {
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
  return isNewerVersion(record.version, currentVersion)
    ? { version: record.version, notes: (record.notes as string | undefined) ?? "" }
    : null;
}

/**
 * Limit response bytes while streaming: checking only text.length *after*
 * response.text() would let a malicious endpoint allocate a huge payload.
 */
async function readManifestBounded(response: Response): Promise<string> {
  if (!response.body) throw new Error("Empty update response");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MANIFEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Error("Update manifest is too large");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function checkForUpdates(
  currentVersion: string,
  cancelSignal?: AbortSignal,
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
    if (bytes && (Number(bytes) > MAX_MANIFEST_BYTES || !Number.isFinite(Number(bytes)))) {
      throw new Error("Update manifest is too large");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(contentType)) throw new Error("Unexpected update response");
    const text = await readManifestBounded(response);
    return parseUpdateManifest(JSON.parse(text) as unknown, currentVersion);
  } finally {
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

/** Missing or invalid old preferences keep update checks enabled by default. */
export function autoUpdateChecksEnabled(value: string | null): boolean {
  return value !== "false";
}
