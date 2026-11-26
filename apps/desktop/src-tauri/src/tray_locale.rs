//! Snapvere by Brendigo — localized notification-area controls.

/// Order: capture region, full screen, record region, record screen,
/// stop recording, gallery, settings, quit, active, pause, resume, paused, folder.
pub fn labels(language: &str) -> [&'static str; 13] {
    match language {
        "en" => [
            "Capture Region",
            "Capture Full Screen",
            "Record Area…",
            "Record This Screen",
            "Stop Recording",
            "Gallery",
            "Settings",
            "Quit",
            "Snapvere — recording in progress",
            "Pause Recording",
            "Resume Recording",
            "Snapvere — recording paused",
            "Open Captures Folder",
        ],
        "hr" => [
            "Snimi područje",
            "Snimi cijeli zaslon",
            "Snimi video područja…",
            "Snimi video cijelog zaslona",
            "Zaustavi snimanje",
            "Galerija",
            "Postavke",
            "Izlaz",
            "Snapvere — snimanje u tijeku",
            "Pauziraj snimanje",
            "Nastavi snimanje",
            "Snapvere — snimanje pauzirano",
            "Otvori mapu snimki",
        ],
        "de" => [
            "Bereich aufnehmen",
            "Gesamten Bildschirm aufnehmen",
            "Bereich aufzeichnen…",
            "Diesen Bildschirm aufzeichnen",
            "Aufnahme stoppen",
            "Galerie",
            "Einstellungen",
            "Beenden",
            "Snapvere — Aufnahme läuft",
            "Aufnahme pausieren",
            "Aufnahme fortsetzen",
            "Snapvere — Aufnahme pausiert",
            "Aufnahmenordner öffnen",
        ],
        "es" => [
            "Capturar región",
            "Capturar pantalla completa",
            "Grabar región…",
            "Grabar esta pantalla",
            "Detener grabación",
            "Galería",
            "Configuración",
            "Salir",
            "Snapvere — grabando",
            "Pausar grabación",
            "Reanudar grabación",
            "Snapvere — grabación pausada",
            "Abrir carpeta de capturas",
        ],
        "fr" => [
            "Capturer une zone",
            "Capturer tout l’écran",
            "Enregistrer une zone…",
            "Enregistrer cet écran",
            "Arrêter l’enregistrement",
            "Galerie",
            "Paramètres",
            "Quitter",
            "Snapvere — enregistrement en cours",
            "Mettre en pause",
            "Reprendre l’enregistrement",
            "Snapvere — enregistrement en pause",
            "Ouvrir le dossier des captures",
        ],
        "it" => [
            "Cattura area",
            "Cattura schermo intero",
            "Registra area…",
            "Registra questo schermo",
            "Interrompi registrazione",
            "Galleria",
            "Impostazioni",
            "Esci",
            "Snapvere — registrazione in corso",
            "Metti in pausa",
            "Riprendi registrazione",
            "Snapvere — registrazione in pausa",
            "Apri cartella acquisizioni",
        ],
        "pt" => [
            "Capturar região",
            "Capturar ecrã inteiro",
            "Gravar região…",
            "Gravar este ecrã",
            "Parar gravação",
            "Galeria",
            "Definições",
            "Sair",
            "Snapvere — gravação em curso",
            "Pausar gravação",
            "Retomar gravação",
            "Snapvere — gravação em pausa",
            "Abrir pasta das capturas",
        ],
        "nl" => [
            "Gebied vastleggen",
            "Volledig scherm vastleggen",
            "Gebied opnemen…",
            "Dit scherm opnemen",
            "Opname stoppen",
            "Galerij",
            "Instellingen",
            "Afsluiten",
            "Snapvere — opname actief",
            "Opname pauzeren",
            "Opname hervatten",
            "Snapvere — opname gepauzeerd",
            "Opnamemap openen",
        ],
        "pl" => [
            "Przechwyć obszar",
            "Przechwyć cały ekran",
            "Nagraj obszar…",
            "Nagraj ten ekran",
            "Zatrzymaj nagrywanie",
            "Galeria",
            "Ustawienia",
            "Zakończ",
            "Snapvere — trwa nagrywanie",
            "Wstrzymaj nagrywanie",
            "Wznów nagrywanie",
            "Snapvere — nagrywanie wstrzymane",
            "Otwórz folder przechwyceń",
        ],
        "cs" => [
            "Zachytit oblast",
            "Zachytit celou obrazovku",
            "Nahrát oblast…",
            "Nahrát tuto obrazovku",
            "Zastavit nahrávání",
            "Galerie",
            "Nastavení",
            "Ukončit",
            "Snapvere — probíhá nahrávání",
            "Pozastavit nahrávání",
            "Pokračovat v nahrávání",
            "Snapvere — nahrávání pozastaveno",
            "Otevřít složku snímků",
        ],
        "sk" => [
            "Zachytiť oblasť",
            "Zachytiť celú obrazovku",
            "Nahrať oblasť…",
            "Nahrať túto obrazovku",
            "Zastaviť nahrávanie",
            "Galéria",
            "Nastavenia",
            "Ukončiť",
            "Snapvere — prebieha nahrávanie",
            "Pozastaviť nahrávanie",
            "Pokračovať v nahrávaní",
            "Snapvere — nahrávanie pozastavené",
            "Otvoriť priečinok snímok",
        ],
        "sl" => [
            "Zajemi območje",
            "Zajemi celoten zaslon",
            "Snemaj območje…",
            "Snemaj ta zaslon",
            "Ustavi snemanje",
            "Galerija",
            "Nastavitve",
            "Izhod",
            "Snapvere — snemanje poteka",
            "Začasno ustavi snemanje",
            "Nadaljuj snemanje",
            "Snapvere — snemanje začasno ustavljeno",
            "Odpri mapo posnetkov",
        ],
        _ => labels("en"),
    }
}

#[cfg(test)]
mod tests {
    use super::labels;

    #[test]
    fn native_menu_has_all_labels_in_all_supported_languages() {
        for language in [
            "en", "hr", "de", "es", "fr", "it", "pt", "nl", "pl", "cs", "sk", "sl",
        ] {
            let words = labels(language);
            assert_eq!(words.len(), 13);
            assert!(words.iter().all(|label| !label.trim().is_empty()));
        }
        assert_eq!(labels("en-US"), labels("en"));
        assert_eq!(labels("en")[12], "Open Captures Folder");
        assert_eq!(labels("hr")[12], "Otvori mapu snimki");
    }
}

/// Recording title, screenshot title, warning, confirm and cancel.
pub fn deletion_labels(language: &str) -> [&'static str; 5] {
    match language {
        "hr" => [
            "Izbrisati videozapis?",
            "Izbrisati snimku zaslona?",
            "Stavka će biti uklonjena iz galerije i izbrisana s diska.",
            "Izbriši",
            "Odustani",
        ],
        "de" => [
            "Aufnahme löschen?",
            "Screenshot löschen?",
            "Dieses Element wird aus der Galerie und von der Festplatte gelöscht.",
            "Löschen",
            "Abbrechen",
        ],
        "es" => [
            "¿Eliminar grabación?",
            "¿Eliminar captura de pantalla?",
            "Este elemento se eliminará de la galería y del disco.",
            "Eliminar",
            "Cancelar",
        ],
        "fr" => [
            "Supprimer l’enregistrement ?",
            "Supprimer la capture ?",
            "Cet élément sera supprimé de la galerie et du disque.",
            "Supprimer",
            "Annuler",
        ],
        "it" => [
            "Eliminare la registrazione?",
            "Eliminare la schermata?",
            "L’elemento verrà rimosso dalla galleria ed eliminato dal disco.",
            "Elimina",
            "Annulla",
        ],
        "pt" => [
            "Eliminar gravação?",
            "Eliminar captura de ecrã?",
            "Este item será removido da galeria e eliminado do disco.",
            "Eliminar",
            "Cancelar",
        ],
        "nl" => [
            "Opname verwijderen?",
            "Schermafbeelding verwijderen?",
            "Dit item wordt uit de galerij en van de schijf verwijderd.",
            "Verwijderen",
            "Annuleren",
        ],
        "pl" => [
            "Usunąć nagranie?",
            "Usunąć zrzut ekranu?",
            "Element zostanie usunięty z galerii i dysku.",
            "Usuń",
            "Anuluj",
        ],
        "cs" => [
            "Smazat záznam?",
            "Smazat snímek obrazovky?",
            "Položka bude odebrána z galerie a smazána z disku.",
            "Smazat",
            "Zrušit",
        ],
        "sk" => [
            "Vymazať záznam?",
            "Vymazať snímku obrazovky?",
            "Položka bude odstránená z galérie a disku.",
            "Odstrániť",
            "Zrušiť",
        ],
        "sl" => [
            "Izbrišem posnetek?",
            "Izbrišem posnetek zaslona?",
            "Element bo odstranjen iz galerije in z diska.",
            "Izbriši",
            "Prekliči",
        ],
        _ => [
            "Delete recording?",
            "Delete screenshot?",
            "This item will be removed from the gallery and deleted from disk.",
            "Delete",
            "Cancel",
        ],
    }
}

/// Linux removal hides the item but deliberately retains the media on disk.
#[cfg(target_os = "linux")]
pub fn quarantine_warning(language: &str) -> &'static str {
    match language {
        "hr" => "Stavka će biti uklonjena iz galerije. Datoteke ostaju na disku radi oporavka; prostor se neće osloboditi.",
        "de" => "Das Element wird aus der Galerie entfernt. Die Dateien bleiben zur Wiederherstellung auf dem Datenträger; es wird kein Speicherplatz freigegeben.",
        "es" => "El elemento se quitará de la galería. Los archivos se conservarán en el disco para su recuperación; no se liberará espacio.",
        "fr" => "L’élément sera retiré de la galerie. Les fichiers restent sur le disque pour la récupération ; aucun espace ne sera libéré.",
        "it" => "L’elemento verrà rimosso dalla galleria. I file resteranno sul disco per il recupero; lo spazio non verrà liberato.",
        "pt" => "O item será removido da galeria. Os ficheiros permanecerão no disco para recuperação; não será libertado espaço.",
        "nl" => "Het item wordt uit de galerij verwijderd. De bestanden blijven op de schijf voor herstel; er komt geen ruimte vrij.",
        "pl" => "Element zostanie usunięty z galerii. Pliki pozostaną na dysku do odzyskania; miejsce nie zostanie zwolnione.",
        "cs" => "Položka bude odebrána z galerie. Soubory zůstanou na disku pro obnovení; místo se neuvolní.",
        "sk" => "Položka bude odstránená z galérie. Súbory zostanú na disku na obnovu; miesto sa neuvoľní.",
        "sl" => "Element bo odstranjen iz galerije. Datoteke ostanejo na disku za obnovitev; prostor se ne sprosti.",
        _ => "This item will be removed from the gallery. Files remain on disk for recovery; disk space will not be freed.",
    }
}

#[cfg(test)]
mod deletion_label_tests {
    use super::deletion_labels;

    #[test]
    fn all_supported_languages_have_native_confirmation_copy() {
        for code in [
            "en", "hr", "de", "es", "fr", "it", "pt", "nl", "pl", "cs", "sk", "sl",
        ] {
            let labels = deletion_labels(code);
            assert!(labels.iter().all(|label| !label.trim().is_empty()));
            assert_ne!(labels[3], labels[4]);
        }
        assert_eq!(deletion_labels("hr")[3], "Izbriši");
        assert_eq!(deletion_labels("unknown"), deletion_labels("en"));
    }
}
