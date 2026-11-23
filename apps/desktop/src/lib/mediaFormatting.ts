// Snapvere by Brendigo
import type { Language } from "./i18n";

/** Never let corrupt persisted metadata crash gallery rendering. */
export function formatMediaSize(bytes: number, language: Language = "en"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  const exponent = bytes >= 1024 ** 4 ? 4 : bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : 1;
  const value = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat(language === "en" ? "en-GB" : language, {
    minimumFractionDigits: exponent >= 2 ? 1 : 0,
    maximumFractionDigits: exponent >= 2 ? 1 : 0,
  }).format(value);
  return `${formatted} ${units[exponent - 1]}`;
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
