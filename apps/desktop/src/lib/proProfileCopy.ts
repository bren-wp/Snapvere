// Snapvere by Brendigo
import type { Language } from "./i18n";
const names = ["title","description","tutorial","presentation","compact","save","apply","clear","empty","saved","applied","cleared","failed","linux"] as const;
type Texts = Record<(typeof names)[number], string>;
const strings: Record<Language, Texts> = Object.fromEntries(
[
  [
    "en",
    [
      "Recording profiles",
      "Built-in presets and three private profiles stored only on this device.",
      "Tutorial",
      "Presentation",
      "Compact GIF",
      "Save current",
      "Apply",
      "Clear",
      "Empty",
      "Saved locally.",
      "Profile applied.",
      "Profile removed.",
      "Unable to save profile.",
      "On Linux only silent GIF recording is available."
    ]
  ],
  [
    "hr",
    [
      "Profili snimanja",
      "Gotove postavke i tri privatna profila spremljena samo na uređaju.",
      "Vodič",
      "Prezentacija",
      "Mali GIF",
      "Spremi trenutne",
      "Primijeni",
      "Ukloni",
      "Prazno",
      "Spremljeno lokalno.",
      "Profil primijenjen.",
      "Profil uklonjen.",
      "Profil nije moguće spremiti.",
      "Na Linuxu je dostupno samo GIF snimanje bez zvuka."
    ]
  ],
  [
    "de",
    [
      "Aufnahmeprofile",
      "Vorlagen und drei private Profile nur auf diesem Gerät.",
      "Anleitung",
      "Präsentation",
      "Kompaktes GIF",
      "Aktuelle speichern",
      "Anwenden",
      "Löschen",
      "Leer",
      "Lokal gespeichert.",
      "Profil angewendet.",
      "Profil gelöscht.",
      "Profil konnte nicht gespeichert werden.",
      "Unter Linux ist nur GIF ohne Ton verfügbar."
    ]
  ],
  [
    "es",
    [
      "Perfiles de grabación",
      "Ajustes predefinidos y tres perfiles privados guardados en este dispositivo.",
      "Tutorial",
      "Presentación",
      "GIF compacto",
      "Guardar actual",
      "Aplicar",
      "Borrar",
      "Vacío",
      "Guardado localmente.",
      "Perfil aplicado.",
      "Perfil borrado.",
      "No se pudo guardar el perfil.",
      "En Linux solo está disponible GIF sin sonido."
    ]
  ],
  [
    "fr",
    [
      "Profils d’enregistrement",
      "Préréglages et trois profils privés conservés sur cet appareil.",
      "Tutoriel",
      "Présentation",
      "GIF compact",
      "Enregistrer",
      "Appliquer",
      "Effacer",
      "Vide",
      "Enregistré localement.",
      "Profil appliqué.",
      "Profil effacé.",
      "Impossible d’enregistrer le profil.",
      "Sous Linux, seul le GIF sans son est disponible."
    ]
  ],
  [
    "it",
    [
      "Profili di registrazione",
      "Preimpostazioni e tre profili privati salvati solo sul dispositivo.",
      "Tutorial",
      "Presentazione",
      "GIF compatto",
      "Salva attuali",
      "Applica",
      "Cancella",
      "Vuoto",
      "Salvato localmente.",
      "Profilo applicato.",
      "Profilo cancellato.",
      "Impossibile salvare il profilo.",
      "Su Linux è disponibile solo GIF senza audio."
    ]
  ],
  [
    "pt",
    [
      "Perfis de gravação",
      "Predefinições e três perfis privados guardados neste dispositivo.",
      "Tutorial",
      "Apresentação",
      "GIF compacto",
      "Guardar atuais",
      "Aplicar",
      "Limpar",
      "Vazio",
      "Guardado localmente.",
      "Perfil aplicado.",
      "Perfil removido.",
      "Não foi possível guardar o perfil.",
      "No Linux só existe gravação GIF sem som."
    ]
  ],
  [
    "nl",
    [
      "Opnameprofielen",
      "Voorinstellingen en drie privéprofielen, alleen lokaal opgeslagen.",
      "Handleiding",
      "Presentatie",
      "Compacte GIF",
      "Huidige opslaan",
      "Toepassen",
      "Wissen",
      "Leeg",
      "Lokaal opgeslagen.",
      "Profiel toegepast.",
      "Profiel gewist.",
      "Kan profiel niet opslaan.",
      "Op Linux is alleen GIF zonder geluid beschikbaar."
    ]
  ],
  [
    "pl",
    [
      "Profile nagrywania",
      "Gotowe ustawienia i trzy prywatne profile zapisane na urządzeniu.",
      "Samouczek",
      "Prezentacja",
      "Mały GIF",
      "Zapisz bieżące",
      "Zastosuj",
      "Usuń",
      "Pusty",
      "Zapisano lokalnie.",
      "Profil zastosowany.",
      "Profil usunięty.",
      "Nie można zapisać profilu.",
      "Na Linuxie dostępny jest tylko GIF bez dźwięku."
    ]
  ],
  [
    "cs",
    [
      "Profily nahrávání",
      "Předvolby a tři soukromé profily uložené pouze v zařízení.",
      "Návod",
      "Prezentace",
      "Malý GIF",
      "Uložit aktuální",
      "Použít",
      "Smazat",
      "Prázdné",
      "Uloženo místně.",
      "Profil použit.",
      "Profil smazán.",
      "Profil nelze uložit.",
      "V Linuxu je dostupný jen GIF bez zvuku."
    ]
  ],
  [
    "sk",
    [
      "Profily nahrávania",
      "Predvoľby a tri súkromné profily uložené iba v zariadení.",
      "Návod",
      "Prezentácia",
      "Malý GIF",
      "Uložiť aktuálne",
      "Použiť",
      "Vymazať",
      "Prázdne",
      "Uložené lokálne.",
      "Profil použitý.",
      "Profil vymazaný.",
      "Profil sa nedá uložiť.",
      "V Linuxe je dostupný iba GIF bez zvuku."
    ]
  ],
  [
    "sl",
    [
      "Profili snemanja",
      "Prednastavitve in trije zasebni profili, shranjeni samo v napravi.",
      "Vodič",
      "Predstavitev",
      "Majhen GIF",
      "Shrani trenutne",
      "Uporabi",
      "Počisti",
      "Prazno",
      "Shranjeno lokalno.",
      "Profil uporabljen.",
      "Profil počiščen.",
      "Profila ni mogoče shraniti.",
      "V Linuxu je na voljo samo GIF brez zvoka."
    ]
  ]
]
  .map(([lang,values]) => [lang, Object.fromEntries(names.map((name,i) => [name,values[i]]))])
) as Record<Language, Texts>;
export const proProfileCopy = (language: Language): Texts => strings[language] ?? strings.en;
