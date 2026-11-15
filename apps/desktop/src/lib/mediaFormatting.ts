import type { Language } from "./i18n";

/** Never let corrupt persisted metadata crash gallery rendering. */
export function formatMediaSize(bytes: number, language: Language = "en"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const megabytes = bytes >= 1024 * 1024;
  const value = bytes / (megabytes ? 1024 * 1024 : 1024);
  const formatted = new Intl.NumberFormat(language === "en" ? "en-GB" : language, {
    minimumFractionDigits: megabytes ? 1 : 0,
    maximumFractionDigits: megabytes ? 1 : 0,
  }).format(value);
  return `${formatted} ${megabytes ? "MB" : "KB"}`;
}

export function formatMediaDate(timestampMs: number, language: Language = "en"): string {
  if (!Number.isFinite(timestampMs)) return "—";
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : language, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
