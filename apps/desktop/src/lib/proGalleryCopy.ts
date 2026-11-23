// Snapvere by Brendigo
import type { Language } from "./i18n";
const keys = ["select","done","selectLoaded","clear","export","exporting","selected","failed","limit","exportedSuffix"] as const;
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
      "files exported locally."
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
      "datoteka lokalno izvezeno."
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
      "Dateien lokal exportiert."
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
      "archivos exportados localmente."
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
      "fichiers exportés localement."
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
      "file esportati localmente."
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
      "ficheiros exportados localmente."
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
      "bestanden lokaal geëxporteerd."
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
      "plików wyeksportowano lokalnie."
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
      "souborů exportováno místně."
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
      "súborov exportovaných lokálne."
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
      "datotek izvoženih lokalno."
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
