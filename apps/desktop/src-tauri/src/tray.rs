//! Snapvere by Brendigo — resident notification icon and recording menu.
//!
//! VAŽNO: tray se kreira ISKLJUČIVO ovdje (`TrayIconBuilder`). NE definiraj
//! `app.trayIcon` u `tauri.conf.json` — Tauri v2 ne spaja dvije registracije po
//! `id`-u, pa bi jedan proces nacrtao dvije identične ikone ("opet dva upaljena").

use std::sync::OnceLock;
use tauri_plugin_store::StoreExt;

use crate::logging::log;
use crate::tray_locale;

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Wry,
};

use crate::commands::{self, CaptureMode};
use crate::models::RecordPhase;
use crate::record;

/// Stavke kojima mijenjamo stanje dok snimanje traje.
struct RecordItems {
    capture_region: MenuItem<Wry>,
    capture_full: MenuItem<Wry>,
    start: MenuItem<Wry>,
    start_screen: MenuItem<Wry>,
    stop: MenuItem<Wry>,
    pause: MenuItem<Wry>,
    resume: MenuItem<Wry>,
    open_gallery: MenuItem<Wry>,
    open_settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

static RECORD_ITEMS: OnceLock<RecordItems> = OnceLock::new();

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let language = current_language(app);
    let labels = tray_locale::labels(&language);
    let capture_region =
        MenuItem::with_id(app, "capture_region", labels[0], true, Some("PrintScreen"))?;
    let capture_full = MenuItem::with_id(app, "capture_full", labels[1], true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let record_region = MenuItem::with_id(
        app,
        "record_region",
        labels[2],
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;
    let record_screen = MenuItem::with_id(app, "record_screen", labels[3], true, None::<&str>)?;
    let record_stop = MenuItem::with_id(app, "record_stop", labels[4], false, None::<&str>)?;
    let record_pause = MenuItem::with_id(app, "record_pause", labels[9], false, None::<&str>)?;
    let record_resume = MenuItem::with_id(app, "record_resume", labels[10], false, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let open_gallery = MenuItem::with_id(app, "open_gallery", labels[5], true, None::<&str>)?;
    let open_settings = MenuItem::with_id(app, "open_settings", labels[6], true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", labels[7], true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_region,
            &capture_full,
            &sep1,
            &record_region,
            &record_screen,
            &record_stop,
            &record_pause,
            &record_resume,
            &sep2,
            &open_gallery,
            &open_settings,
            &sep3,
            &quit,
        ],
    )?;

    let _ = RECORD_ITEMS.set(RecordItems {
        capture_region,
        capture_full,
        start: record_region,
        start_screen: record_screen,
        stop: record_stop,
        pause: record_pause,
        resume: record_resume,
        open_gallery,
        open_settings,
        quit,
    });

    let mut builder = TrayIconBuilder::with_id("snapvere-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Snapvere")
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_tray_event);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// Synchronize recording controls with the actual native recorder phase.
pub fn set_recording(app: &AppHandle, active: bool) {
    set_phase(
        app,
        if active {
            RecordPhase::Recording
        } else {
            RecordPhase::Idle
        },
    );
}

fn enabled_actions(phase: RecordPhase) -> (bool, bool, bool, bool) {
    match phase {
        RecordPhase::Idle => (true, false, false, false),
        RecordPhase::Recording => (false, true, true, false),
        RecordPhase::Paused => (false, true, false, true),
        RecordPhase::Finishing => (false, false, false, false),
    }
}

pub fn set_phase(app: &AppHandle, phase: RecordPhase) {
    let (can_start, can_stop, can_pause, can_resume) = enabled_actions(phase);
    if let Some(items) = RECORD_ITEMS.get() {
        let _ = items.start.set_enabled(can_start);
        let _ = items.start_screen.set_enabled(can_start);
        let _ = items.stop.set_enabled(can_stop);
        let _ = items.pause.set_enabled(can_pause);
        let _ = items.resume.set_enabled(can_resume);
    }
    update_tray_tooltip(app, &current_language(app), phase);
}

fn current_language(app: &AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("language"))
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| "en".to_owned())
}

fn update_tray_tooltip(app: &AppHandle, language: &str, phase: RecordPhase) {
    if let Some(tray) = app.tray_by_id("snapvere-tray") {
        let tooltip = match phase {
            RecordPhase::Recording => tray_locale::labels(language)[8],
            RecordPhase::Paused => tray_locale::labels(language)[11],
            _ => "Snapvere",
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

/// Apply the selected interface language immediately, including the Windows
/// notification-area menu and active-recording tooltip.
pub fn set_language(app: &AppHandle, language: &str) {
    let labels = tray_locale::labels(language);
    if let Some(items) = RECORD_ITEMS.get() {
        let updates = [
            (&items.capture_region, labels[0]),
            (&items.capture_full, labels[1]),
            (&items.start, labels[2]),
            (&items.start_screen, labels[3]),
            (&items.stop, labels[4]),
            (&items.pause, labels[9]),
            (&items.resume, labels[10]),
            (&items.open_gallery, labels[5]),
            (&items.open_settings, labels[6]),
            (&items.quit, labels[7]),
        ];
        for (item, text) in updates {
            if let Err(error) = item.set_text(text) {
                log(&format!("tray localization: {error}"));
            }
        }
    }
    update_tray_tooltip(app, language, record::status(app).phase);
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "capture_region" => commands::dispatch_region_capture(app, CaptureMode::Shot),
        "capture_full" => commands::dispatch_capture_fullscreen(app),
        "record_region" => commands::dispatch_region_capture(app, CaptureMode::Record),
        "record_screen" => commands::dispatch_record_fullscreen(app),
        "record_stop" => {
            if let Err(error) = record::stop(app) {
                log(&format!("tray stop: {error}"));
            }
        }
        "record_pause" => {
            if let Err(error) = record::set_paused(app, true) {
                log(&format!("tray pause: {error}"));
            }
        }
        "record_resume" => {
            if let Err(error) = record::set_paused(app, false) {
                log(&format!("tray resume: {error}"));
            }
        }
        "open_gallery" => {
            let _ = commands::show_home(app.clone());
        }
        "open_settings" => {
            let _ = commands::open_settings(app);
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn on_tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let _ = commands::show_home(tray.app_handle().clone());
    }
}

#[cfg(test)]
mod menu_state_tests {
    use super::enabled_actions;
    use crate::models::RecordPhase;

    #[test]
    fn recording_menu_actions_follow_recorder_state() {
        assert_eq!(
            enabled_actions(RecordPhase::Idle),
            (true, false, false, false)
        );
        assert_eq!(
            enabled_actions(RecordPhase::Recording),
            (false, true, true, false)
        );
        assert_eq!(
            enabled_actions(RecordPhase::Paused),
            (false, true, false, true)
        );
        assert_eq!(
            enabled_actions(RecordPhase::Finishing),
            (false, false, false, false)
        );
    }
}
