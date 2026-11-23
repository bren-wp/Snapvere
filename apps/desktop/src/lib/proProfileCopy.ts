// Snapvere by Brendigo
import type { Language } from "./i18n";
const names = ["title","description","tutorial","presentation","compact","save","apply","clear","empty","saved","applied","cleared","failed","linux","webinar","smooth","archive","social","detailedGif"] as const;
type Texts = Record<(typeof names)[number], string>;
const strings: Record<Language, Texts> = Object.fromEntries(
[
  [
    "en",
    [
      "Recording profiles",
      "Eight recording presets and six private profiles stored only on this device.",
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
      "On Linux only silent GIF recording is available.",
      "Webinar",
      "Smooth 60 FPS",
      "Maximum detail",
      "Social clip",
      "Detailed GIF"
    ]
  ],
  [
    "hr",
    [
      "Profili snimanja",
      "Osam postavki snimanja i šest privatnih profila na uređaju.",
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
      "Na Linuxu je dostupno samo GIF snimanje bez zvuka.",
      "Webinar",
      "Glatko 60 FPS",
      "Najviša kvaliteta",
      "Kratki video",
      "Detaljni GIF"
    ]
  ],
  [
    "de",
    [
      "Aufnahmeprofile",
      "Acht Vorlagen und sechs private Profile nur auf diesem Gerät.",
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
      "Unter Linux ist nur GIF ohne Ton verfügbar.",
      "Webinar",
      "Flüssig 60 FPS",
      "Maximale Qualität",
      "Social Clip",
      "Detail-GIF"
    ]
  ],
  [
    "es",
    [
      "Perfiles de grabación",
      "Ocho ajustes y seis perfiles privados guardados en este dispositivo.",
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
      "En Linux solo está disponible GIF sin sonido.",
      "Seminario web",
      "Fluido 60 FPS",
      "Máxima calidad",
      "Clip social",
      "GIF detallado"
    ]
  ],
  [
    "fr",
    [
      "Profils d’enregistrement",
      "Huit préréglages et six profils privés sur cet appareil.",
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
      "Sous Linux, seul le GIF sans son est disponible.",
      "Webinaire",
      "Fluide 60 FPS",
      "Qualité maximale",
      "Clip social",
      "GIF détaillé"
    ]
  ],
  [
    "it",
    [
      "Profili di registrazione",
      "Otto preset e sei profili privati salvati sul dispositivo.",
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
      "Su Linux è disponibile solo GIF senza audio.",
      "Webinar",
      "Fluido 60 FPS",
      "Qualità massima",
      "Clip social",
      "GIF dettagliata"
    ]
  ],
  [
    "pt",
    [
      "Perfis de gravação",
      "Oito predefinições e seis perfis privados guardados neste dispositivo.",
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
      "No Linux só existe gravação GIF sem som.",
      "Webinar",
      "Fluido 60 FPS",
      "Qualidade máxima",
      "Clipe social",
      "GIF detalhado"
    ]
  ],
  [
    "nl",
    [
      "Opnameprofielen",
      "Acht voorinstellingen en zes privéprofielen, alleen lokaal opgeslagen.",
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
      "Op Linux is alleen GIF zonder geluid beschikbaar.",
      "Webinar",
      "Vloeiend 60 FPS",
      "Maximale kwaliteit",
      "Sociale clip",
      "Gedetailleerde GIF"
    ]
  ],
  [
    "pl",
    [
      "Profile nagrywania",
      "Osiem ustawień i sześć prywatnych profili zapisanych na urządzeniu.",
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
      "Na Linuxie dostępny jest tylko GIF bez dźwięku.",
      "Webinarium",
      "Płynne 60 FPS",
      "Maksymalna jakość",
      "Klip społecznościowy",
      "Szczegółowy GIF"
    ]
  ],
  [
    "cs",
    [
      "Profily nahrávání",
      "Osm předvoleb a šest soukromých profilů uložených v zařízení.",
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
      "V Linuxu je dostupný jen GIF bez zvuku.",
      "Webinář",
      "Plynulých 60 FPS",
      "Maximální kvalita",
      "Krátký klip",
      "Detailní GIF"
    ]
  ],
  [
    "sk",
    [
      "Profily nahrávania",
      "Osem predvolieb a šesť súkromných profilov v zariadení.",
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
      "V Linuxe je dostupný iba GIF bez zvuku.",
      "Webinár",
      "Plynulých 60 FPS",
      "Maximálna kvalita",
      "Krátky klip",
      "Detailný GIF"
    ]
  ],
  [
    "sl",
    [
      "Profili snemanja",
      "Osem prednastavitev in šest zasebnih profilov v napravi.",
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
      "V Linuxu je na voljo samo GIF brez zvoka.",
      "Spletni seminar",
      "Gladko 60 FPS",
      "Najvišja kakovost",
      "Kratek posnetek",
      "Podroben GIF"
    ]
  ]
]
  .map(([lang,values]) => [lang, Object.fromEntries(names.map((name,i) => [name,values[i]]))])
) as Record<Language, Texts>;
export const proProfileCopy = (language: Language): Texts => strings[language] ?? strings.en;
