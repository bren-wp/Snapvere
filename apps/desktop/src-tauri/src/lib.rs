//! Snapvere by Brendigo — Tauri 2 desktop core.
//! Initializes the native capture services, notification-area icon and command boundary.

mod capture;
mod commands;
mod db;
mod gallery_delete;
mod logging;
mod models;
mod record;
mod shortcuts;
mod shutdown;
mod startup;
mod state;
mod tray;
mod tray_locale;

use tauri::Manager;

use db::Db;
use logging::log;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Panic hook prije svega ostalog — inače prvi panic prođe bez traga.
    logging::install_panic_hook();

    // Neki WebView2/GPU driveri ruše borderless overlay webview (exit 0xC..., "Edge se pojavi").
    // Isključi GPU akceleraciju u WebView2 → stabilno na svim mašinama.
    // Diagnostic flags may expose WebView2's remote debugger. Only use them in
    // debug builds; production captures must never inherit such endpoints.
    #[cfg(windows)]
    let webview_args = if cfg!(debug_assertions) {
        match std::env::var("SNAPVERE_WEBVIEW_ARGS") {
            Ok(extra) if !extra.trim().is_empty() => format!("--disable-gpu {}", extra.trim()),
            _ => "--disable-gpu".to_owned(),
        }
    } else {
        "--disable-gpu".to_owned()
    };
    #[cfg(windows)]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", webview_args);

    let app = tauri::Builder::default()
        // Keep login startup silent even if an instance is already running.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !startup::is_background_start(args) {
                let _ = commands::show_home(app.clone());
            }
        }))
        // ── ostali plugini ───────────────────────────────────────
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![startup::BACKGROUND_START_ARG]),
        ))
        // ── setup: log, baza, tray, hotkeyi ──────────────────────
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            logging::init(&data_dir);

            // Never silently replace a persistent gallery with a volatile DB:
            // it could make recordings and tags appear saved until next launch.
            let db_path = data_dir.join("snapvere.db");
            let db = match Db::open(&db_path) {
                Ok(db) => db,
                Err(e) => {
                    let warning = format!(
                        "SNAPVERE cannot open its local gallery database:\n{}\n\nError: {e}\n\nYour existing database and captures were not deleted. The application will not start with a temporary replacement. Close other Snapvere processes, check folder permissions and storage, or restore a trusted backup before restarting.",
                        db_path.display()
                    );
                    log(&warning);
                    #[cfg(windows)]
                    show_database_error(&warning);
                    return Err(e.to_string().into());
                }
            };
            app.manage(AppState::new(db));

            // A resident process must have a working tray icon before startup is enabled.
            tray::build_tray(app.handle()).map_err(|error| {
                log(&format!("tray initialization failed: {error}"));
                error
            })?;
            // Existing explicit startup opt-outs remain authoritative.
            startup::sync_autostart(app.handle());

            let (capture_hk, record_hk) = shortcuts::register_defaults(app.handle());
            log(&format!(
                "hotkeyi — capture: {}, snimanje: {}",
                capture_hk.as_deref().unwrap_or("<nijedan slobodan>"),
                record_hk.as_deref().unwrap_or("<nijedan slobodan>")
            ));

            // Pred-kreiraj (skrivene) overlay, HUD i sloj za crtanje da capture i
            // snimanje budu instant — stvaranje WebView2 prozora traje ~0.5 s po komadu.
            if let Err(e) = commands::ensure_overlay(app.handle()) {
                log(&format!("pred-kreiranje overlaya: {e}"));
            }
            if let Err(e) = commands::ensure_rec_windows(app.handle()) {
                log(&format!("pred-kreiranje prozora snimanja: {e}"));
            }
            record::warm_up();

            // Manual .exe launch opens Snapvere. When Windows starts Snapvere
            // at login it remains in the tray; its registered global
            // PrintScreen shortcut opens the native capture overlay on demand.
            if !startup::is_background_start(std::env::args().skip(1)) {
                if let Err(error) = commands::show_home(app.handle().clone()) {
                    log(&format!("cannot show Snapvere on launch: {error}"));
                    return Err(error.into());
                }
            }

            Ok(())
        })
        // ── komande dostupne frontendu ───────────────────────────
        .invoke_handler(tauri::generate_handler![
            commands::get_app_language,
            commands::get_platform_capabilities,
            commands::list_linux_audio_devices,
            commands::select_linux_audio_devices,
            commands::set_app_language,
            commands::get_capture_preferences,
            commands::get_overlay_recording_preferences,
            commands::set_overlay_audio_preference,
            commands::list_monitors,
            commands::begin_region_capture,
            commands::reveal_overlay,
            commands::get_frozen_frame,
            commands::get_frozen_rgba,
            commands::finish_region_capture,
            commands::cancel_capture,
            commands::capture_fullscreen,
            commands::save_edited_image,
            commands::save_image_as,
            commands::copy_base64_to_clipboard,
            commands::import_clipboard_image,
            commands::start_recording,
            commands::stop_recording,
            commands::cancel_recording,
            commands::pause_recording,
            commands::recording_status,
            commands::set_draw_interactive,
            commands::set_blur_regions,
            commands::close_rec_hud,
            commands::set_rec_hud_expanded,
            commands::rec_frame_rect,
            commands::list_screenshots,
            commands::search_screenshots,
            commands::delete_screenshot,
            commands::add_tag,
            commands::open_media,
            commands::reveal_media,
            commands::copy_media_image,
            commands::copy_media_path,
            commands::pro_export_batch,
            commands::show_home,
            commands::log_file_path,
            commands::open_capture_folder,
            commands::open_data_folder,
            shortcuts::update_hotkey,
            shortcuts::update_record_hotkey,
            shortcuts::active_hotkeys,
        ])
        // ── window lifecycle: X na glavnom prozoru SAKRIJE (tray app), ne uništi ──
        // Bez ovoga Tauri uništi "home" pri zatvaranju, pa ga show_home (tray klik,
        // hotkey, single-instance) više ne može vratiti. Pravi izlaz = tray "Quit".
        .on_window_event(|window, event| {
            // Klik na sloj za crtanje ga aktivira i digne iznad HUD-a → HUD odmah natrag na vrh,
            // inače "Stop" ispod njega postane nedostupan (i svaki klik crta).
            if let tauri::WindowEvent::Focused(true) = event {
                if window.label() == "recdraw" {
                    commands::raise_hud(window.app_handle());
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    "home" => {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    // UI snimanja se ne zatvara ručno — X bi ostavio snimanje bez kontrola.
                    "recbar" | "recdraw" | "recframe" => {
                        api.prevent_close();
                    }
                    _ => {}
                }
            }
        })
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                // `code: None` = zatvoren zadnji prozor. Snapvere je tray aplikacija i
                // mora preživjeti — bez ovoga se proces ugasi i hotkey prestane raditi.
                if code.is_none() {
                    api.prevent_exit();
                    return;
                }
                // Finalization stays off the UI thread. Never discard an unfinished recording.
                if !shutdown::allow_exit(app_handle) {
                    api.prevent_exit();
                    return;
                }
                log("Snapvere exited");
            }
        }),
        Err(e) => {
            log(&format!("FATALNO: aplikacija se nije pokrenula — {e}"));
            eprintln!("[snapvere] greška pri pokretanju aplikacije: {e}");
        }
    }
}

// Show the failure before the primary Tauri window is available.
#[cfg(windows)]
fn show_database_error(message: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let body: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let title: Vec<u16> = "SNAPVERE — Gallery unavailable"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: The buffers are live, NUL-terminated UTF-16 strings for the
    // duration of the synchronous Windows call; no owner window exists yet.
    unsafe {
        let _ = MessageBoxW(
            None,
            PCWSTR(body.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}
