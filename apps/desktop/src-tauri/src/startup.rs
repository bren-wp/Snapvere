// Snapvere by Brendigo
//! User-scoped login startup and resident notification-area launch behavior.

use crate::logging::log;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

pub const BACKGROUND_START_ARG: &str = "--snapvere-startup-hidden";

pub fn is_background_start(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().any(|arg| arg == BACKGROUND_START_ARG)
}

// Unset means fresh installation. Invalid stored values must not change Windows startup.
fn should_autostart(preference: Option<Option<bool>>) -> Option<bool> {
    // Preserve Windows tray-first startup; Linux requires explicit opt-in.
    preference.unwrap_or(Some(cfg!(windows)))
}

pub fn sync_autostart(app: &tauri::AppHandle) {
    // Development binaries must not replace the startup entry of an installed app.
    if cfg!(debug_assertions) {
        return;
    }

    let store = match app.store("settings.json") {
        Ok(store) => store,
        Err(error) => {
            log(&format!("autostart: cannot read settings: {error}"));
            return;
        }
    };
    let stored = store.get("autostart");
    let enabled = match should_autostart(stored.as_ref().map(|value| value.as_bool())) {
        Some(enabled) => enabled,
        None => {
            log("autostart: invalid stored preference; system startup unchanged");
            return;
        }
    };
    let launcher = app.autolaunch();

    // Refresh the current executable path after an update or relocation.
    let result = if enabled {
        launcher.enable()
    } else {
        match launcher.is_enabled() {
            Ok(true) => launcher.disable(),
            Ok(false) => Ok(()),
            Err(error) => {
                log(&format!(
                    "autostart: cannot query system startup entry: {error}"
                ));
                return;
            }
        }
    };

    match result {
        Ok(()) => log(if enabled {
            "autostart: enabled (resident tray at login)"
        } else {
            "autostart: disabled by user preference"
        }),
        Err(error) => log(&format!(
            "autostart: operating system rejected change: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_background_start, should_autostart};

    #[test]
    fn default_is_enabled_but_explicit_user_opt_out_is_respected() {
        assert_eq!(should_autostart(None), Some(cfg!(windows)));
        assert_eq!(should_autostart(Some(Some(true))), Some(true));
        assert_eq!(should_autostart(Some(Some(false))), Some(false));
        assert_eq!(should_autostart(Some(None)), None);
    }

    #[test]
    fn login_background_flag_does_not_open_gallery() {
        assert!(is_background_start(
            ["--snapvere-startup-hidden".to_owned()]
        ));
        assert!(is_background_start([
            "snapvere.exe".to_owned(),
            "--snapvere-startup-hidden".to_owned(),
        ]));
    }

    #[test]
    fn manual_launch_and_similar_flags_show_gallery() {
        assert!(!is_background_start(std::iter::empty()));
        assert!(!is_background_start(["--help".to_owned()]));
        assert!(!is_background_start([
            "--snapvere-startup-hidden=1".to_owned()
        ]));
        assert!(!is_background_start(["--hidden".to_owned()]));
    }
}
