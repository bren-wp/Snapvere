// Snapvere by Brendigo
//! Native recording-window geometry and per-monitor placement.

use super::{cursor_pos, ensure_rec_windows, estr, raise_topmost, REC_HUD_H};
use crate::capture;
use crate::models::{RecFrameRect, Region};
use crate::record::RecordTarget;
use crate::state::{lock, AppState};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Odredi monitor za snimanje: eksplicitni id, inače onaj pod mišem.
pub(super) fn resolve_target(
    app: &AppHandle,
    region: Option<Region>,
    monitor_id: Option<u32>,
) -> Result<RecordTarget, String> {
    let monitors = capture::list_monitors().map_err(estr)?;
    let wanted = monitor_id.or_else(|| region.map(|r| r.monitor_id));

    let m = wanted
        .and_then(|id| monitors.iter().find(|m| m.id == id))
        .or_else(|| {
            let (cx, cy) = cursor_pos(app);
            monitors.iter().find(|m| {
                capture::contains_desktop_point(cx, cy, m.x, m.y, m.width, m.height)
            })
        })
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .or_else(|| monitors.first())
        .ok_or("nema dostupnog monitora")?;

    Ok(RecordTarget {
        monitor_id: m.id,
        monitor_x: m.x,
        monitor_y: m.y,
        monitor_w: m.width,
        monitor_h: m.height,
        region,
    })
}

/// Mala uvijek-na-vrhu traka s tajmerom i kontrolama, na dnu snimanog monitora.
pub(super) fn show_rec_hud(app: &AppHandle, target: &RecordTarget) -> Result<(), String> {
    ensure_rec_windows(app)?;
    let win = app
        .get_webview_window("recbar")
        .ok_or("HUD prozor nedostaje")?;

    // Dno-centar snimanog monitora, malo iznad ruba.
    let scale = win.scale_factor().map_err(estr)?;
    let base_height = (f64::from(REC_HUD_H) * scale).round().max(1.0) as u32;
    let size = win.inner_size().map_err(estr)?;
    // Previous recording may have ended with a popup open; always restart
    // with a compact native HWND before computing the next HUD position.
    if size.height != base_height {
        win.set_size(PhysicalSize::new(size.width, base_height))
            .map_err(estr)?;
    }
    // Center using the actual physical HWND width; REC_HUD_W is logical and
    // would shift the toolbar off center at 125%, 150% or 200% scaling.
    let x = target.monitor_x + (target.monitor_w as i32 - size.width as i32) / 2;
    let y = target.monitor_y + target.monitor_h as i32 - base_height as i32 - 48;
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.show();
    raise_topmost(&win);
    Ok(())
}

/// Prozirni sloj za crtanje, točno preko snimanog područja.
///
/// Za razliku od HUD-a, ovaj prozor NAMJERNO nije izuzet iz capture-a: DXGI hvata
/// kompozitirani desktop, pa sve nacrtano završi u videu bez ijedne linije koda za
/// kompozitiranje u Rustu — isti canvas renderer kao kod screenshota.
pub(super) fn show_rec_draw(
    app: &AppHandle,
    target: &RecordTarget,
    crop: (u32, u32, u32, u32),
) -> Result<(), String> {
    let (ox, oy, ow, oh) = crop;
    let x = target.monitor_x + ox as i32;
    let y = target.monitor_y + oy as i32;

    ensure_rec_windows(app)?;
    let win = app
        .get_webview_window("recdraw")
        .ok_or("prozor za crtanje nedostaje")?;
    // Čist sloj za novo snimanje — anotacije prošlog ne smiju ostati.
    let _ = win.emit("snapvere:draw-clear", ());

    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(ow, oh));
    // Dok nije odabran alat sloj mora propuštati klikove — inače se ne može
    // raditi ništa drugo dok snimanje traje.
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.show();
    Ok(())
}

/// Okvir snimanja preko CIJELOG monitora: zatamni sve oko snimanog područja i
/// nacrta rub oko njega, pa korisnik u svakom trenutku vidi što točno ulazi u video.
///
/// Prozor je izuzet iz capture-a i click-through, pa ne utječe ni na snimku ni na rad.
pub(super) fn show_rec_frame(
    app: &AppHandle,
    target: &RecordTarget,
    crop: (u32, u32, u32, u32),
) -> Result<(), String> {
    let (ox, oy, ow, oh) = crop;
    let rect = RecFrameRect {
        x: ox,
        y: oy,
        width: ow,
        height: oh,
        full: target.region.is_none(),
    };
    *lock(&app.state::<AppState>().rec_frame) = Some(rect);

    ensure_rec_windows(app)?;
    let win = app
        .get_webview_window("recframe")
        .ok_or("prozor okvira nedostaje")?;
    let _ = win.set_position(PhysicalPosition::new(target.monitor_x, target.monitor_y));
    let _ = win.set_size(PhysicalSize::new(target.monitor_w, target.monitor_h));
    let _ = win.set_ignore_cursor_events(true);
    // Event ide PRIJE show-a: prvi prikaz već nosi točan okvir, bez bljeska praznog sloja.
    let _ = win.emit("snapvere:rec-frame", rect);
    let _ = win.show();
    Ok(())
}
