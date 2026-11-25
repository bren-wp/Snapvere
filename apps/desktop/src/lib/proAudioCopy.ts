// Snapvere by Brendigo
import type { Language } from "./i18n";

const labels: Record<Language, readonly [string, string, string]> = {
  en: ["Microphone gain", "System audio gain", "Applies to the next MP4 recording. 0% silences the selected source; values above 100% may clip."],
  hr: ["Pojačanje mikrofona", "Pojačanje sistemskog zvuka", "Vrijedi za sljedeće MP4 snimanje. 0% utišava odabrani izvor; iznad 100% može doći do izobličenja."],
  de: ["Mikrofonverstärkung", "Systemaudio-Verstärkung", "Gilt für die nächste MP4-Aufnahme. 0 % schaltet die gewählte Quelle stumm; über 100 % kann es zu Übersteuerung kommen."],
  es: ["Ganancia del micrófono", "Ganancia del audio del sistema", "Se aplica a la próxima grabación MP4. 0% silencia la fuente; más del 100% puede saturar."],
  fr: ["Gain du microphone", "Gain du son système", "Pour le prochain enregistrement MP4. 0 % coupe la source ; au-delà de 100 %, risque de saturation."],
  it: ["Guadagno microfono", "Guadagno audio di sistema", "Vale per la prossima registrazione MP4. 0% silenzia la sorgente; oltre il 100% può causare distorsione."],
  pt: ["Ganho do microfone", "Ganho do áudio do sistema", "Aplica-se à próxima gravação MP4. 0% silencia a fonte; acima de 100% pode saturar."],
  nl: ["Microfoonversterking", "Systeemaudioversterking", "Geldt voor de volgende MP4-opname. 0% dempt de bron; boven 100% kan oversturing optreden."],
  pl: ["Wzmocnienie mikrofonu", "Wzmocnienie dźwięku systemowego", "Dotyczy następnego nagrania MP4. 0% wycisza źródło; powyżej 100% może wystąpić przesterowanie."],
  cs: ["Zesílení mikrofonu", "Zesílení systémového zvuku", "Platí pro další záznam MP4. 0 % ztlumí zdroj; nad 100 % může dojít ke zkreslení."],
  sk: ["Zosilnenie mikrofónu", "Zosilnenie systémového zvuku", "Platí pre ďalší záznam MP4. 0 % stlmí zdroj; nad 100 % môže dôjsť ku skresleniu."],
  sl: ["Ojačanje mikrofona", "Ojačanje sistemskega zvoka", "Velja za naslednje snemanje MP4. 0 % utiša vir; nad 100 % lahko pride do popačenja."],
};
export const proAudioCopy = (language: Language) => labels[language] ?? labels.en;
