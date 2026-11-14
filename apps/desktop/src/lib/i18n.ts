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

export function normalizeLanguage(value: unknown): Language {
  return typeof value === "string" && LANGUAGES.some((lang) => lang.code === value)
    ? value as Language : "en";
}

export function translate(language: Language, englishText: string): string {
  if (language === "en") return englishText;
  const index = (CORE_STRINGS as readonly string[]).indexOf(englishText);
  return index < 0 ? englishText : translations[language][index] || englishText;
}

export function missingCoreTranslations(): string[] {
  return Object.entries(translations)
    .filter(([, values]) => values.length !== CORE_STRINGS.length || values.some((value) => !value.trim()))
    .map(([language]) => language);
}
