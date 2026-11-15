//! System tray ikona i quick menu.
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
use crate::record;

/// Stavke kojima mijenjamo stanje dok snimanje traje.
struct RecordItems {
    capture_region: MenuItem<Wry>,
    capture_full: MenuItem<Wry>,
    start: MenuItem<Wry>,
    start_screen: MenuItem<Wry>,
    stop: MenuItem<Wry>,
    open_gallery: MenuItem<Wry>,
    open_settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

static RECORD_ITEMS: OnceLock<RecordItems> = OnceLock::new();

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let language = current_language(app);
    let labels = tray_locale::labels(&language);
    let capture_region = MenuItem::with_id(
        app,
        "capture_region",
        labels[0],
        true,
        Some("PrintScreen"),
    )?;
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        labels[1],
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let record_region = MenuItem::with_id(
        app,
        "record_region",
        labels[2],
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;
    let record_screen = MenuItem::with_id(
        app,
        "record_screen",
        labels[3],
        true,
        None::<&str>,
    )?;
    let record_stop = MenuItem::with_id(app, "record_stop", labels[4], false, None::<&str>)?;
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

/// Prebaci tray u "snima se" stanje (poziva se iz recordera).
pub fn set_recording(app: &AppHandle, active: bool) {
    if let Some(items) = RECORD_ITEMS.get() {
        let _ = items.start.set_enabled(!active);
        let _ = items.start_screen.set_enabled(!active);
        let _ = items.stop.set_enabled(active);
    }
    update_tray_tooltip(app, &current_language(app));
}

fn current_language(app: &AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("language"))
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| "en".to_owned())
}

fn update_tray_tooltip(app: &AppHandle, language: &str) {
    if let Some(tray) = app.tray_by_id("snapvere-tray") {
        let tooltip = if record::is_active(app) {
            tray_locale::labels(language)[8]
        } else {
            "Snapvere"
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
    update_tray_tooltip(app, language);
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "capture_region" => commands::dispatch_region_capture(app, CaptureMode::Shot),
        "capture_full" => commands::dispatch_capture_fullscreen(app),
        "record_region" => commands::dispatch_region_capture(app, CaptureMode::Record),
        "record_screen" => commands::dispatch_record_fullscreen(app),
        "record_stop" => {
            let _ = record::stop(app);
        }
        "open_gallery" => {
            let _ = commands::show_home(app.clone());
        }
        "open_settings" => {
            let _ = commands::open_settings(app);
        }
        "quit" => {
            // Snimanje u tijeku mora uredno zatvoriti datoteku prije izlaza.
            if record::is_active(app) {
                let _ = record::stop(app);
                // ExitRequested waits for encoding and gallery registration; do
                // not exit based on an arbitrary 600 ms delay.
            }
            app.exit(0);
        }
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
