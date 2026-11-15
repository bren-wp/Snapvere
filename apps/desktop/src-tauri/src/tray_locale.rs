//! Localized native tray labels. The English edition remains the fallback.

/// Order: capture region, full screen, record region, record screen,
/// stop recording, gallery, settings, quit, active recording tooltip.
pub fn labels(language: &str) -> [&'static str; 9] {
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
            assert_eq!(words.len(), 9);
            assert!(words.iter().all(|label| !label.trim().is_empty()));
        }
        assert_eq!(labels("en-US"), labels("en"));
    }
}
