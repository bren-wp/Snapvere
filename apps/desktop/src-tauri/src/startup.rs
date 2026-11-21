// Snapvere by Brendigo
//! User-scoped login startup and resident notification-area launch behavior.

use crate::logging::log;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

pub const BACKGROUND_START_ARG: &str = "--snapvere-startup-hidden";

pub fn is_background_start(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().any(|arg| arg == BACKGROUND_START_ARG)
}

// An absent value means this installation has never explicitly opted out.
// Stored false takes priority over the new-installation default.
fn should_autostart(preference: Option<bool>) -> bool {
    preference.unwrap_or(true)
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
    if stored.as_ref().is_some_and(|value| value.as_bool().is_none()) {
        log("autostart: invalid stored preference; using default");
    }
    let enabled = should_autostart(stored.as_ref().and_then(|value| value.as_bool()));
    let launcher = app.autolaunch();

    // Refresh the current executable path after an update or relocation.
    let result = if enabled {
        launcher.enable()
    } else {
        match launcher.is_enabled() {
            Ok(true) => launcher.disable(),
            Ok(false) => Ok(()),
            Err(error) => {
                log(&format!("autostart: cannot query system startup entry: {error}"));
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
        Err(error) => log(&format!("autostart: operating system rejected change: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_background_start, should_autostart};

    #[test]
    fn default_is_enabled_but_explicit_user_opt_out_is_respected() {
        assert!(should_autostart(None));
        assert!(should_autostart(Some(true)));
        assert!(!should_autostart(Some(false)));
    }

    #[test]
    fn login_background_flag_does_not_open_gallery() {
        assert!(is_background_start(["--snapvere-startup-hidden".to_owned()]));
        assert!(is_background_start([
            "snapvere.exe".to_owned(),
            "--snapvere-startup-hidden".to_owned(),
        ]));
    }

    #[test]
    fn manual_launch_and_similar_flags_show_gallery() {
        assert!(!is_background_start(std::iter::empty()));
        assert!(!is_background_start(["--help".to_owned()]));
        assert!(!is_background_start(["--snapvere-startup-hidden=1".to_owned()]));
        assert!(!is_background_start(["--hidden".to_owned()]));
    }
}
