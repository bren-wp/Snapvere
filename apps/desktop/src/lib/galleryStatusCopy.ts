// Snapvere by Brendigo
import type { Language } from "./i18n";

type GalleryStatusCopy = Readonly<{ retry: string }>;
const copy: Record<Language, GalleryStatusCopy> = {
  en: { retry: "Try again" },
  hr: { retry: "Pokušaj ponovno" },
  de: { retry: "Erneut versuchen" },
  es: { retry: "Reintentar" },
  fr: { retry: "Réessayer" },
  it: { retry: "Riprova" },
  pt: { retry: "Tentar novamente" },
  nl: { retry: "Opnieuw proberen" },
  pl: { retry: "Spróbuj ponownie" },
  cs: { retry: "Zkusit znovu" },
  sk: { retry: "Skúsiť znova" },
  sl: { retry: "Poskusi znova" },
};
export function galleryStatusCopy(language: Language): GalleryStatusCopy {
  return copy[language] ?? copy.en;
}
