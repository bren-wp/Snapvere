/** SNAPVERE UI languages. English remains the authoritative fallback. */
export const LANGUAGES = [
  {
    "code": "en",
    "label": "English"
  },
  {
    "code": "hr",
    "label": "Hrvatski"
  },
  {
    "code": "de",
    "label": "Deutsch"
  },
  {
    "code": "es",
    "label": "Español"
  },
  {
    "code": "fr",
    "label": "Français"
  },
  {
    "code": "it",
    "label": "Italiano"
  },
  {
    "code": "pt",
    "label": "Português"
  },
  {
    "code": "nl",
    "label": "Nederlands"
  },
  {
    "code": "pl",
    "label": "Polski"
  },
  {
    "code": "cs",
    "label": "Čeština"
  },
  {
    "code": "sk",
    "label": "Slovenčina"
  },
  {
    "code": "sl",
    "label": "Slovenščina"
  }
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];

export const CORE_STRINGS = [
  "Settings",
  "Capture",
  "Recording",
  "Save",
  "Hotkeys",
  "General",
  "Privacy",
  "About",
  "Language",
  "Theme",
  "Dark",
  "Light",
  "Capture region",
  "Record screen",
  "Full screen",
  "Your captures",
  "All",
  "Images",
  "Videos",
  "Change",
  "Folder",
  "Launch on startup",
  "Default format",
  "Frame rate",
  "Include the mouse cursor",
  "Record microphone",
  "Record system audio",
  "Stop after",
  "Quality",
  "No results",
  "No screenshots yet",
  "Loading…",
  "Load more captures",
  "Cancel",
  "Delete",
  "Open capture folder",
  "Open data folder",
  "Search names and tags…"
] as const;

// The shared navigation, capture and settings controls have human-reviewed
// translations. Other copy intentionally falls back to English until reviewed.
const translations: Record<Exclude<Language, "en">, readonly string[]> = {
  hr: ["Postavke","Snimke","Snimanje videa","Spremanje","Prečaci","Općenito","Privatnost","O programu","Jezik","Tema","Tamna","Svijetla","Snimi područje","Snimi zaslon","Cijeli zaslon","Vaše snimke","Sve","Slike","Videozapisi","Promijeni","Mapa","Pokreni pri prijavi","Zadani format","Broj sličica","Prikaži pokazivač miša","Snimi mikrofon","Snimi zvuk sustava","Zaustavi nakon","Kvaliteta","Nema rezultata","Još nema snimki","Učitavanje…","Učitaj više snimki","Odustani","Izbriši","Otvori mapu snimki","Otvori mapu podataka","Pretraži nazive i oznake…"],
  de: ["Einstellungen","Aufnahme","Videoaufnahme","Speichern","Tastenkürzel","Allgemein","Datenschutz","Info","Sprache","Design","Dunkel","Hell","Bereich aufnehmen","Bildschirm aufzeichnen","Vollbild","Deine Aufnahmen","Alle","Bilder","Videos","Ändern","Ordner","Beim Start öffnen","Standardformat","Bildrate","Mauszeiger aufnehmen","Mikrofon aufnehmen","Systemton aufnehmen","Stoppen nach","Qualität","Keine Ergebnisse","Noch keine Screenshots","Wird geladen…","Weitere Aufnahmen laden","Abbrechen","Löschen","Aufnahmeordner öffnen","Datenordner öffnen","Namen und Tags suchen…"],
  es: ["Configuración","Capturas","Grabación","Guardar","Atajos","General","Privacidad","Acerca de","Idioma","Tema","Oscuro","Claro","Capturar región","Grabar pantalla","Pantalla completa","Tus capturas","Todo","Imágenes","Vídeos","Cambiar","Carpeta","Iniciar con Windows","Formato predeterminado","Fotogramas por segundo","Incluir el cursor","Grabar micrófono","Grabar audio del sistema","Detener tras","Calidad","Sin resultados","Aún no hay capturas","Cargando…","Cargar más capturas","Cancelar","Eliminar","Abrir carpeta de capturas","Abrir carpeta de datos","Buscar nombres y etiquetas…"],
  fr: ["Paramètres","Capture","Enregistrement","Enregistrer","Raccourcis","Général","Confidentialité","À propos","Langue","Thème","Sombre","Clair","Capturer une zone","Enregistrer l’écran","Plein écran","Vos captures","Tout","Images","Vidéos","Modifier","Dossier","Lancer au démarrage","Format par défaut","Fréquence d’images","Inclure le curseur","Enregistrer le microphone","Enregistrer le son système","Arrêter après","Qualité","Aucun résultat","Aucune capture pour le moment","Chargement…","Charger plus de captures","Annuler","Supprimer","Ouvrir le dossier des captures","Ouvrir le dossier des données","Rechercher noms et étiquettes…"],
  it: ["Impostazioni","Cattura","Registrazione","Salva","Scorciatoie","Generale","Privacy","Informazioni","Lingua","Tema","Scuro","Chiaro","Cattura area","Registra schermo","Schermo intero","Le tue catture","Tutte","Immagini","Video","Cambia","Cartella","Avvia all’accesso","Formato predefinito","Frequenza fotogrammi","Includi il cursore","Registra microfono","Registra audio di sistema","Interrompi dopo","Qualità","Nessun risultato","Nessuna cattura ancora","Caricamento…","Carica altre catture","Annulla","Elimina","Apri cartella catture","Apri cartella dati","Cerca nomi e tag…"],
  pt: ["Definições","Captura","Gravação","Guardar","Atalhos","Geral","Privacidade","Sobre","Idioma","Tema","Escuro","Claro","Capturar região","Gravar ecrã","Ecrã inteiro","As suas capturas","Todas","Imagens","Vídeos","Alterar","Pasta","Iniciar com o sistema","Formato predefinido","Taxa de fotogramas","Incluir cursor","Gravar microfone","Gravar áudio do sistema","Parar após","Qualidade","Sem resultados","Ainda sem capturas","A carregar…","Carregar mais capturas","Cancelar","Eliminar","Abrir pasta de capturas","Abrir pasta de dados","Pesquisar nomes e etiquetas…"],
  nl: ["Instellingen","Opname","Schermopname","Opslaan","Sneltoetsen","Algemeen","Privacy","Over","Taal","Thema","Donker","Licht","Gebied vastleggen","Scherm opnemen","Volledig scherm","Je opnamen","Alles","Afbeeldingen","Video’s","Wijzigen","Map","Starten bij aanmelden","Standaardformaat","Beeldsnelheid","Muisaanwijzer opnemen","Microfoon opnemen","Systeemaudio opnemen","Stoppen na","Kwaliteit","Geen resultaten","Nog geen schermafbeeldingen","Laden…","Meer opnamen laden","Annuleren","Verwijderen","Opnamemap openen","Gegevensmap openen","Zoek namen en tags…"],
  pl: ["Ustawienia","Zrzuty","Nagrywanie","Zapisz","Skróty","Ogólne","Prywatność","Informacje","Język","Motyw","Ciemny","Jasny","Przechwyć obszar","Nagraj ekran","Pełny ekran","Twoje nagrania","Wszystkie","Obrazy","Wideo","Zmień","Folder","Uruchom przy logowaniu","Domyślny format","Liczba klatek","Dołącz kursor myszy","Nagraj mikrofon","Nagraj dźwięk systemu","Zatrzymaj po","Jakość","Brak wyników","Brak zrzutów ekranu","Ładowanie…","Załaduj więcej","Anuluj","Usuń","Otwórz folder zrzutów","Otwórz folder danych","Szukaj nazw i tagów…"],
  cs: ["Nastavení","Snímky","Nahrávání","Uložit","Zkratky","Obecné","Soukromí","O aplikaci","Jazyk","Motiv","Tmavý","Světlý","Zachytit oblast","Nahrát obrazovku","Celá obrazovka","Vaše snímky","Vše","Obrázky","Videa","Změnit","Složka","Spustit po přihlášení","Výchozí formát","Snímková frekvence","Zahrnout kurzor","Nahrávat mikrofon","Nahrávat systémový zvuk","Zastavit po","Kvalita","Žádné výsledky","Zatím žádné snímky","Načítání…","Načíst další snímky","Zrušit","Smazat","Otevřít složku snímků","Otevřít složku dat","Hledat názvy a štítky…"],
  sk: ["Nastavenia","Snímky","Nahrávanie","Uložiť","Skratky","Všeobecné","Súkromie","O aplikácii","Jazyk","Téma","Tmavá","Svetlá","Zachytiť oblasť","Nahrať obrazovku","Celá obrazovka","Vaše snímky","Všetky","Obrázky","Videá","Zmeniť","Priečinok","Spustiť pri prihlásení","Predvolený formát","Snímková frekvencia","Zahrnúť kurzor","Nahrávať mikrofón","Nahrávať systémový zvuk","Zastaviť po","Kvalita","Žiadne výsledky","Zatiaľ žiadne snímky","Načítava sa…","Načítať ďalšie snímky","Zrušiť","Odstrániť","Otvoriť priečinok snímok","Otvoriť priečinok údajov","Hľadať názvy a značky…"],
  sl: ["Nastavitve","Zajem","Snemanje","Shrani","Bližnjice","Splošno","Zasebnost","O programu","Jezik","Tema","Temna","Svetla","Zajemi območje","Snemaj zaslon","Celoten zaslon","Vaši posnetki","Vse","Slike","Videi","Spremeni","Mapa","Zaženi ob prijavi","Privzeta oblika","Hitrost sličic","Vključi kazalec","Snemaj mikrofon","Snemaj sistemski zvok","Ustavi po","Kakovost","Ni rezultatov","Še ni posnetkov zaslona","Nalaganje…","Naloži več posnetkov","Prekliči","Izbriši","Odpri mapo posnetkov","Odpri mapo podatkov","Išči imena in oznake…"],
};

/** Gallery, media viewer and recording HUD actions. */
export const ACTION_STRINGS = [
  "Play recording",
  "View screenshot",
  "Show in folder",
  "Open in default app",
  "Copy image",
  "Copy file path",
  "Exit full screen",
  "Close",
  "Previous",
  "Next",
  "Copied to clipboard",
  "File path copied",
  "Pause",
  "Resume",
  "Stop and save",
  "Discard",
  "Saving…",
  "Undo",
  "Clear all drawings",
  "Colour",
  "Size",
  "Could not change pause state. Try again.",
  "Could not stop recording. Try again.",
  "Could not discard recording. Try again.",
  "Delete recording?",
  "Delete screenshot?",
  "This item will be removed from the gallery and deleted from disk.",
  "Click through (drawing off)",
  "Arrow",
  "Rectangle",
  "Ellipse",
  "Line",
  "Pen",
  "Marker",
  "Numbered step",
  "Blur / redact",
  "Text"
] as const;
const actionTranslations: Record<Exclude<Language, "en">, readonly string[]> = {
  hr: ["Reproduciraj snimku","Pregledaj snimku zaslona","Prikaži u mapi","Otvori u zadanom programu","Kopiraj sliku","Kopiraj putanju datoteke","Izađi iz cijelog zaslona","Zatvori","Prethodno","Sljedeće","Kopirano u međuspremnik","Putanja datoteke kopirana","Pauziraj","Nastavi","Zaustavi i spremi","Odbaci","Spremanje…","Poništi","Izbriši sve crteže","Boja","Veličina","Nije moguće promijeniti pauzu. Pokušajte ponovno.","Nije moguće zaustaviti snimanje. Pokušajte ponovno.","Nije moguće odbaciti snimanje. Pokušajte ponovno.","Izbrisati videozapis?","Izbrisati snimku zaslona?","Stavka će biti uklonjena iz galerije i izbrisana s diska.","Propuštaj klikove (crtanje isključeno)","Strelica","Pravokutnik","Elipsa","Linija","Olovka","Marker","Numerirani korak","Zamagli / sakrij","Tekst"],
  de: ["Aufnahme abspielen","Screenshot ansehen","Im Ordner anzeigen","In Standard-App öffnen","Bild kopieren","Dateipfad kopieren","Vollbild verlassen","Schließen","Zurück","Weiter","In Zwischenablage kopiert","Dateipfad kopiert","Pause","Fortsetzen","Stoppen und speichern","Verwerfen","Speichern…","Rückgängig","Alle Zeichnungen löschen","Farbe","Größe","Pause konnte nicht geändert werden. Erneut versuchen.","Aufnahme konnte nicht gestoppt werden. Erneut versuchen.","Aufnahme konnte nicht verworfen werden. Erneut versuchen.","Aufnahme löschen?","Screenshot löschen?","Dieses Element wird aus der Galerie und von der Festplatte gelöscht.","Klicks durchlassen (Zeichnen aus)","Pfeil","Rechteck","Ellipse","Linie","Stift","Markierer","Nummerierter Schritt","Unkenntlich machen","Text"],
  es: ["Reproducir grabación","Ver captura de pantalla","Mostrar en carpeta","Abrir en la aplicación predeterminada","Copiar imagen","Copiar ruta del archivo","Salir de pantalla completa","Cerrar","Anterior","Siguiente","Copiado al portapapeles","Ruta del archivo copiada","Pausar","Reanudar","Detener y guardar","Descartar","Guardando…","Deshacer","Borrar todos los dibujos","Color","Tamaño","No se pudo cambiar la pausa. Inténtalo de nuevo.","No se pudo detener la grabación. Inténtalo de nuevo.","No se pudo descartar la grabación. Inténtalo de nuevo.","¿Eliminar grabación?","¿Eliminar captura de pantalla?","Este elemento se eliminará de la galería y del disco.","Permitir clics (dibujo desactivado)","Flecha","Rectángulo","Elipse","Línea","Lápiz","Marcador","Paso numerado","Difuminar / ocultar","Texto"],
  fr: ["Lire l’enregistrement","Afficher la capture","Afficher dans le dossier","Ouvrir avec l’application par défaut","Copier l’image","Copier le chemin du fichier","Quitter le plein écran","Fermer","Précédent","Suivant","Copié dans le presse-papiers","Chemin du fichier copié","Pause","Reprendre","Arrêter et enregistrer","Ignorer","Enregistrement…","Annuler","Effacer tous les dessins","Couleur","Taille","Impossible de changer la pause. Réessayez.","Impossible d’arrêter l’enregistrement. Réessayez.","Impossible de supprimer l’enregistrement. Réessayez.","Supprimer l’enregistrement ?","Supprimer la capture ?","Cet élément sera supprimé de la galerie et du disque.","Laisser passer les clics (dessin désactivé)","Flèche","Rectangle","Ellipse","Ligne","Stylo","Surligneur","Étape numérotée","Flouter / masquer","Texte"],
  it: ["Riproduci registrazione","Visualizza schermata","Mostra nella cartella","Apri con l’app predefinita","Copia immagine","Copia percorso file","Esci da schermo intero","Chiudi","Precedente","Successivo","Copiato negli appunti","Percorso file copiato","Pausa","Riprendi","Interrompi e salva","Scarta","Salvataggio…","Annulla","Cancella tutti i disegni","Colore","Dimensione","Impossibile cambiare la pausa. Riprova.","Impossibile interrompere la registrazione. Riprova.","Impossibile scartare la registrazione. Riprova.","Eliminare la registrazione?","Eliminare la schermata?","L’elemento verrà rimosso dalla galleria ed eliminato dal disco.","Lascia passare i clic (disegno disattivato)","Freccia","Rettangolo","Ellisse","Linea","Penna","Evidenziatore","Passaggio numerato","Sfoca / oscura","Testo"],
  pt: ["Reproduzir gravação","Ver captura de ecrã","Mostrar na pasta","Abrir na aplicação predefinida","Copiar imagem","Copiar caminho do ficheiro","Sair do ecrã inteiro","Fechar","Anterior","Seguinte","Copiado para a área de transferência","Caminho do ficheiro copiado","Pausar","Retomar","Parar e guardar","Descartar","A guardar…","Desfazer","Apagar todos os desenhos","Cor","Tamanho","Não foi possível alterar a pausa. Tente novamente.","Não foi possível parar a gravação. Tente novamente.","Não foi possível descartar a gravação. Tente novamente.","Eliminar gravação?","Eliminar captura de ecrã?","Este item será removido da galeria e eliminado do disco.","Permitir cliques (desenho desativado)","Seta","Retângulo","Elipse","Linha","Caneta","Marcador","Passo numerado","Desfocar / ocultar","Texto"],
  nl: ["Opname afspelen","Schermafbeelding bekijken","In map tonen","Openen in standaardapp","Afbeelding kopiëren","Bestandspad kopiëren","Volledig scherm verlaten","Sluiten","Vorige","Volgende","Gekopieerd naar klembord","Bestandspad gekopieerd","Pauzeren","Hervatten","Stoppen en opslaan","Verwijderen","Opslaan…","Ongedaan maken","Alle tekeningen wissen","Kleur","Grootte","Pauzestand wijzigen mislukt. Probeer opnieuw.","Opname stoppen mislukt. Probeer opnieuw.","Opname verwijderen mislukt. Probeer opnieuw.","Opname verwijderen?","Schermafbeelding verwijderen?","Dit item wordt uit de galerij en van de schijf verwijderd.","Klikken doorlaten (tekenen uit)","Pijl","Rechthoek","Ellips","Lijn","Pen","Markeerstift","Genummerde stap","Vervagen / afschermen","Tekst"],
  pl: ["Odtwórz nagranie","Wyświetl zrzut ekranu","Pokaż w folderze","Otwórz w domyślnej aplikacji","Kopiuj obraz","Kopiuj ścieżkę pliku","Wyjdź z pełnego ekranu","Zamknij","Poprzedni","Następny","Skopiowano do schowka","Skopiowano ścieżkę pliku","Wstrzymaj","Wznów","Zatrzymaj i zapisz","Odrzuć","Zapisywanie…","Cofnij","Wyczyść wszystkie rysunki","Kolor","Rozmiar","Nie można zmienić pauzy. Spróbuj ponownie.","Nie można zatrzymać nagrania. Spróbuj ponownie.","Nie można odrzucić nagrania. Spróbuj ponownie.","Usunąć nagranie?","Usunąć zrzut ekranu?","Element zostanie usunięty z galerii i dysku.","Przepuszczaj kliknięcia (rysowanie wyłączone)","Strzałka","Prostokąt","Elipsa","Linia","Pióro","Marker","Krok z numerem","Rozmyj / ukryj","Tekst"],
  cs: ["Přehrát záznam","Zobrazit snímek obrazovky","Zobrazit ve složce","Otevřít ve výchozí aplikaci","Kopírovat obrázek","Kopírovat cestu k souboru","Ukončit celou obrazovku","Zavřít","Předchozí","Další","Zkopírováno do schránky","Cesta k souboru zkopírována","Pozastavit","Pokračovat","Zastavit a uložit","Zahodit","Ukládání…","Zpět","Smazat všechny kresby","Barva","Velikost","Nelze změnit pozastavení. Zkuste to znovu.","Nelze zastavit nahrávání. Zkuste to znovu.","Nelze zahodit nahrávání. Zkuste to znovu.","Smazat záznam?","Smazat snímek obrazovky?","Položka bude odebrána z galerie a smazána z disku.","Propouštět kliknutí (kreslení vypnuto)","Šipka","Obdélník","Elipsa","Čára","Pero","Zvýrazňovač","Číslovaný krok","Rozmazat / zakrýt","Text"],
  sk: ["Prehrať záznam","Zobraziť snímku obrazovky","Zobraziť v priečinku","Otvoriť v predvolenej aplikácii","Kopírovať obrázok","Kopírovať cestu k súboru","Ukončiť celú obrazovku","Zavrieť","Predchádzajúci","Ďalší","Skopírované do schránky","Cesta k súboru skopírovaná","Pozastaviť","Pokračovať","Zastaviť a uložiť","Zahodiť","Ukladanie…","Späť","Vymazať všetky kresby","Farba","Veľkosť","Nedá sa zmeniť pozastavenie. Skúste to znova.","Nedá sa zastaviť nahrávanie. Skúste to znova.","Nedá sa zahodiť nahrávanie. Skúste to znova.","Vymazať záznam?","Vymazať snímku obrazovky?","Položka bude odstránená z galérie a disku.","Prepúšťať kliknutia (kreslenie vypnuté)","Šípka","Obdĺžnik","Elipsa","Čiara","Pero","Zvýrazňovač","Číslovaný krok","Rozmazať / skryť","Text"],
  sl: ["Predvajaj posnetek","Prikaži posnetek zaslona","Prikaži v mapi","Odpri v privzetem programu","Kopiraj sliko","Kopiraj pot do datoteke","Izhod iz celozaslonskega načina","Zapri","Prejšnji","Naslednji","Kopirano v odložišče","Pot do datoteke kopirana","Premor","Nadaljuj","Ustavi in shrani","Zavrzi","Shranjevanje…","Razveljavi","Počisti vse risbe","Barva","Velikost","Premora ni mogoče spremeniti. Poskusite znova.","Snemanja ni mogoče ustaviti. Poskusite znova.","Posnetka ni mogoče zavreči. Poskusite znova.","Izbrišem posnetek?","Izbrišem posnetek zaslona?","Element bo odstranjen iz galerije in z diska.","Dovoli klike (risanje izklopljeno)","Puščica","Pravokotnik","Elipsa","Črta","Pero","Označevalnik","Oštevilčen korak","Zamegli / skrij","Besedilo"],
};

export function normalizeLanguage(value: unknown): Language {
  return typeof value === "string" && LANGUAGES.some((lang) => lang.code === value)
    ? value as Language : "en";
}

export function translate(language: Language, englishText: string): string {
  if (language === "en") return englishText;
  const index = (CORE_STRINGS as readonly string[]).indexOf(englishText);
  if (index >= 0) return translations[language][index] || englishText;
  const actionIndex = (ACTION_STRINGS as readonly string[]).indexOf(englishText);
  return actionIndex < 0 ? englishText : actionTranslations[language][actionIndex] || englishText;
}

export function missingCoreTranslations(): string[] {
  return LANGUAGES.filter(({ code }) => {
    if (code === "en") return false;
    const basic = translations[code];
    const actions = actionTranslations[code];
    return basic.length !== CORE_STRINGS.length
      || actions.length !== ACTION_STRINGS.length
      || basic.some((value) => !value.trim())
      || actions.some((value) => !value.trim());
  }).map(({ code }) => code);
}
