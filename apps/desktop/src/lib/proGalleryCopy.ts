// Snapvere by Brendigo
import type { Language } from "./i18n";
const keys = ["select","done","selectLoaded","clear","export","exporting","selected","failed","limit","exportedSuffix","imagesOnly","videosOnly","invert","studioTitle","studioSubtitle","profiles","batchTools"] as const;
type Copy = Record<(typeof keys)[number], string>;
const translations: Record<Language, Copy> = Object.fromEntries(
[
  [
    "en",
    [
      "Select captures",
      "Done",
      "Select loaded",
      "Clear selection",
      "Export to folder",
      "Exporting…",
      "Selected",
      "The export could not be completed. Your captures remain in the gallery.",
      "You can select up to 100 files.",
      "files exported locally.",
      "Images only",
      "Videos only",
      "Invert loaded",
      "Professional capture studio",
      "Eight recording presets, six saved profiles and private batch export.",
      "Recording profiles",
      "Batch workspace"
    ]
  ],
  [
    "hr",
    [
      "Odaberi snimke",
      "Gotovo",
      "Odaberi učitane",
      "Poništi odabir",
      "Izvezi u mapu",
      "Izvozim…",
      "Odabrano",
      "Izvoz nije uspio. Izvorne snimke ostaju u galeriji.",
      "Možete odabrati najviše 100 datoteka.",
      "datoteka lokalno izvezeno.",
      "Samo slike",
      "Samo videozapisi",
      "Obrni učitane",
      "Profesionalni studio snimanja",
      "Osam postavki snimanja, šest profila i privatni skupni izvoz.",
      "Profili snimanja",
      "Skupni rad"
    ]
  ],
  [
    "de",
    [
      "Aufnahmen auswählen",
      "Fertig",
      "Geladene auswählen",
      "Auswahl aufheben",
      "In Ordner exportieren",
      "Exportiere…",
      "Ausgewählt",
      "Export fehlgeschlagen. Originale bleiben in der Galerie.",
      "Bis zu 100 Dateien auswählbar.",
      "Dateien lokal exportiert.",
      "Nur Bilder",
      "Nur Videos",
      "Geladene umkehren",
      "Professionelles Aufnahmestudio",
      "Acht Vorlagen, sechs Profile und privater Sammelexport.",
      "Aufnahmeprofile",
      "Stapelexport"
    ]
  ],
  [
    "es",
    [
      "Seleccionar capturas",
      "Hecho",
      "Seleccionar cargadas",
      "Borrar selección",
      "Exportar a carpeta",
      "Exportando…",
      "Seleccionadas",
      "Falló la exportación. Las capturas originales siguen en la galería.",
      "Puedes seleccionar hasta 100 archivos.",
      "archivos exportados localmente.",
      "Solo imágenes",
      "Solo vídeos",
      "Invertir cargados",
      "Estudio profesional de captura",
      "Ocho ajustes, seis perfiles y exportación local por lotes.",
      "Perfiles de grabación",
      "Exportación en lote"
    ]
  ],
  [
    "fr",
    [
      "Sélectionner des captures",
      "Terminé",
      "Sélectionner les chargées",
      "Effacer la sélection",
      "Exporter vers un dossier",
      "Exportation…",
      "Sélectionnées",
      "Échec de l’exportation. Les captures restent dans la galerie.",
      "100 fichiers maximum.",
      "fichiers exportés localement.",
      "Images seulement",
      "Vidéos seulement",
      "Inverser chargées",
      "Studio de capture professionnel",
      "Huit préréglages, six profils et export local par lots.",
      "Profils d'enregistrement",
      "Export par lots"
    ]
  ],
  [
    "it",
    [
      "Seleziona acquisizioni",
      "Fatto",
      "Seleziona caricate",
      "Cancella selezione",
      "Esporta in cartella",
      "Esportazione…",
      "Selezionati",
      "Esportazione non riuscita. Le acquisizioni restano in galleria.",
      "Puoi selezionare fino a 100 file.",
      "file esportati localmente.",
      "Solo immagini",
      "Solo video",
      "Inverti caricate",
      "Studio di acquisizione professionale",
      "Otto preset, sei profili ed esportazione locale in gruppo.",
      "Profili di registrazione",
      "Esportazione multipla"
    ]
  ],
  [
    "pt",
    [
      "Selecionar capturas",
      "Concluído",
      "Selecionar carregadas",
      "Limpar seleção",
      "Exportar para pasta",
      "A exportar…",
      "Selecionados",
      "A exportação falhou. As capturas ficam na galeria.",
      "Pode selecionar até 100 ficheiros.",
      "ficheiros exportados localmente.",
      "Só imagens",
      "Só vídeos",
      "Inverter carregados",
      "Estúdio de captura profissional",
      "Oito predefinições, seis perfis e exportação local em lote.",
      "Perfis de gravação",
      "Exportação em lote"
    ]
  ],
  [
    "nl",
    [
      "Opnamen selecteren",
      "Gereed",
      "Geladen selecteren",
      "Selectie wissen",
      "Exporteren naar map",
      "Exporteren…",
      "Geselecteerd",
      "Export mislukt. De opnamen blijven in de galerij.",
      "Maximaal 100 bestanden selecteren.",
      "bestanden lokaal geëxporteerd.",
      "Alleen afbeeldingen",
      "Alleen video's",
      "Geladen omkeren",
      "Professionele opnamestudio",
      "Acht presets, zes profielen en lokale bulkexport.",
      "Opnameprofielen",
      "Bulkexport"
    ]
  ],
  [
    "pl",
    [
      "Wybierz nagrania",
      "Gotowe",
      "Wybierz wczytane",
      "Wyczyść wybór",
      "Eksportuj do folderu",
      "Eksportowanie…",
      "Wybrano",
      "Eksport nie powiódł się. Nagrania pozostają w galerii.",
      "Możesz wybrać do 100 plików.",
      "plików wyeksportowano lokalnie.",
      "Tylko obrazy",
      "Tylko filmy",
      "Odwróć wczytane",
      "Profesjonalne studio nagrań",
      "Osiem ustawień, sześć profili i lokalny eksport zbiorczy.",
      "Profile nagrywania",
      "Eksport zbiorczy"
    ]
  ],
  [
    "cs",
    [
      "Vybrat snímky",
      "Hotovo",
      "Vybrat načtené",
      "Zrušit výběr",
      "Exportovat do složky",
      "Exportování…",
      "Vybráno",
      "Export se nezdařil. Záznamy zůstávají v galerii.",
      "Nejvýše 100 souborů.",
      "souborů exportováno místně.",
      "Pouze obrázky",
      "Pouze videa",
      "Obrátit načtené",
      "Profesionální studio záznamu",
      "Osm předvoleb, šest profilů a místní dávkový export.",
      "Profily nahrávání",
      "Dávkový export"
    ]
  ],
  [
    "sk",
    [
      "Vybrať snímky",
      "Hotovo",
      "Vybrať načítané",
      "Zrušiť výber",
      "Exportovať do priečinka",
      "Exportovanie…",
      "Vybrané",
      "Export zlyhal. Záznamy zostávajú v galérii.",
      "Najviac 100 súborov.",
      "súborov exportovaných lokálne.",
      "Iba obrázky",
      "Iba videá",
      "Obrátiť načítané",
      "Profesionálne štúdio záznamu",
      "Osem predvolieb, šesť profilov a lokálny dávkový export.",
      "Profily nahrávania",
      "Dávkový export"
    ]
  ],
  [
    "sl",
    [
      "Izberi posnetke",
      "Končano",
      "Izberi naložene",
      "Počisti izbiro",
      "Izvozi v mapo",
      "Izvažanje…",
      "Izbrano",
      "Izvoz ni uspel. Posnetki ostanejo v galeriji.",
      "Izberete lahko največ 100 datotek.",
      "datotek izvoženih lokalno.",
      "Samo slike",
      "Samo videi",
      "Obrni naložene",
      "Profesionalni studio zajema",
      "Osem prednastavitev, šest profilov in lokalni paketni izvoz.",
      "Profili snemanja",
      "Paketni izvoz"
    ]
  ]
]
  .map(([language, values]) => [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))])
) as Record<Language, Copy>;
export function proGalleryCopy(language: Language) {
  const copy = translations[language] ?? translations.en;
  return {
    ...copy,
    count: (count: number) => `${copy.selected}: ${count} / 100`,
    exported: (count: number) => `${count} ${copy.exportedSuffix}`,
  };
}
