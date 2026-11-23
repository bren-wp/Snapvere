// Snapvere by Brendigo
import type { Language } from "./i18n";

type GalleryStatusCopy = Readonly<{ retry: string; refresh: string; previewUnavailable: string }>;
const copy: Record<Language, GalleryStatusCopy> = {
  en: { retry: "Try again", refresh: "Refresh gallery", previewUnavailable: "Preview unavailable" },
  hr: { retry: "Pokušaj ponovno", refresh: "Osvježi galeriju", previewUnavailable: "Pretpregled nije dostupan" },
  de: { retry: "Erneut versuchen", refresh: "Galerie aktualisieren", previewUnavailable: "Vorschau nicht verfügbar" },
  es: { retry: "Reintentar", refresh: "Actualizar galería", previewUnavailable: "Vista previa no disponible" },
  fr: { retry: "Réessayer", refresh: "Actualiser la galerie", previewUnavailable: "Aperçu indisponible" },
  it: { retry: "Riprova", refresh: "Aggiorna galleria", previewUnavailable: "Anteprima non disponibile" },
  pt: { retry: "Tentar novamente", refresh: "Atualizar galeria", previewUnavailable: "Pré-visualização indisponível" },
  nl: { retry: "Opnieuw proberen", refresh: "Galerij vernieuwen", previewUnavailable: "Voorbeeld niet beschikbaar" },
  pl: { retry: "Spróbuj ponownie", refresh: "Odśwież galerię", previewUnavailable: "Podgląd niedostępny" },
  cs: { retry: "Zkusit znovu", refresh: "Obnovit galerii", previewUnavailable: "Náhled není k dispozici" },
  sk: { retry: "Skúsiť znova", refresh: "Obnoviť galériu", previewUnavailable: "Náhľad nie je k dispozícii" },
  sl: { retry: "Poskusi znova", refresh: "Osveži galerijo", previewUnavailable: "Predogled ni na voljo" },
};
export function galleryStatusCopy(language: Language): GalleryStatusCopy {
  return copy[language] ?? copy.en;
}
