// Snapvere by Brendigo
import type { Language } from "./i18n";

type GalleryStatusCopy = Readonly<{ retry: string; refresh: string }>;
const copy: Record<Language, GalleryStatusCopy> = {
  en: { retry: "Try again", refresh: "Refresh gallery" },
  hr: { retry: "Pokušaj ponovno", refresh: "Osvježi galeriju" },
  de: { retry: "Erneut versuchen", refresh: "Galerie aktualisieren" },
  es: { retry: "Reintentar", refresh: "Actualizar galería" },
  fr: { retry: "Réessayer", refresh: "Actualiser la galerie" },
  it: { retry: "Riprova", refresh: "Aggiorna galleria" },
  pt: { retry: "Tentar novamente", refresh: "Atualizar galeria" },
  nl: { retry: "Opnieuw proberen", refresh: "Galerij vernieuwen" },
  pl: { retry: "Spróbuj ponownie", refresh: "Odśwież galerię" },
  cs: { retry: "Zkusit znovu", refresh: "Obnovit galerii" },
  sk: { retry: "Skúsiť znova", refresh: "Obnoviť galériu" },
  sl: { retry: "Poskusi znova", refresh: "Osveži galerijo" },
};
export function galleryStatusCopy(language: Language): GalleryStatusCopy {
  return copy[language] ?? copy.en;
}
