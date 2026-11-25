// Snapvere by Brendigo
import type { Language } from "./i18n";

const labels: Record<Language, readonly [string, string, string, string, string, string]> = {
  en: ["Segment review", "Set start", "Set end", "Loop segment", "Clear range", "Preview only — source unchanged"],
  hr: ["Pregled segmenta", "Postavi početak", "Postavi kraj", "Ponavljaj segment", "Poništi raspon", "Samo pregled — izvor ostaje nepromijenjen"],
  de: ["Segmentprüfung", "Start setzen", "Ende setzen", "Segment wiederholen", "Bereich löschen", "Nur Vorschau — Original unverändert"],
  es: ["Revisión de segmento", "Fijar inicio", "Fijar fin", "Repetir segmento", "Borrar intervalo", "Solo vista previa — original intacto"],
  fr: ["Révision du segment", "Définir le début", "Définir la fin", "Boucler le segment", "Effacer la plage", "Aperçu uniquement — source intacte"],
  it: ["Revisione segmento", "Imposta inizio", "Imposta fine", "Ripeti segmento", "Cancella intervallo", "Solo anteprima — origine invariata"],
  pt: ["Revisão do segmento", "Definir início", "Definir fim", "Repetir segmento", "Limpar intervalo", "Só pré-visualização — original intacto"],
  nl: ["Segmentcontrole", "Begin instellen", "Einde instellen", "Segment herhalen", "Bereik wissen", "Alleen voorbeeld — bron ongewijzigd"],
  pl: ["Przegląd fragmentu", "Ustaw początek", "Ustaw koniec", "Zapętl fragment", "Wyczyść zakres", "Tylko podgląd — źródło bez zmian"],
  cs: ["Kontrola úseku", "Nastavit začátek", "Nastavit konec", "Opakovat úsek", "Zrušit rozsah", "Pouze náhled — zdroj beze změny"],
  sk: ["Kontrola úseku", "Nastaviť začiatok", "Nastaviť koniec", "Opakovať úsek", "Zrušiť rozsah", "Len náhľad — zdroj nezmenený"],
  sl: ["Pregled odseka", "Nastavi začetek", "Nastavi konec", "Ponavljaj odsek", "Počisti obseg", "Samo predogled — vir nespremenjen"],
};
export const proTimelineCopy = (language: Language) => labels[language] ?? labels.en;
