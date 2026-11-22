// Snapvere by Brendigo
//! Native recording-window geometry and per-monitor placement.

use super::{cursor_pos, ensure_rec_windows, estr, raise_topmost, REC_HUD_H};
use crate::capture;
use crate::models::{MonitorInfo, RecFrameRect, Region};
use crate::record::RecordTarget;
use crate::state::{lock, AppState};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Explicit monitor selection must fail rather than silently record a
/// different monitor after a hotplug or display rearrangement.
fn select_record_monitor(
    monitors: &[MonitorInfo],
    wanted: Option<u32>,
    cursor: (i32, i32),
) -> Result<&MonitorInfo, String> {
    if let Some(id) = wanted {
        return monitors.iter().find(|m| m.id == id).ok_or_else(|| {
            format!("Selected monitor {id} is no longer available. Refresh monitors.")
        });
    }
    let (cx, cy) = cursor;
    monitors
        .iter()
        .find(|m| capture::contains_desktop_point(cx, cy, m.x, m.y, m.width, m.height))
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .or_else(|| monitors.first())
        .ok_or_else(|| "No monitors are available".to_string())
}

/// Position Tauri overlays in physical pixels without signed overflow when
/// mixed-DPI or virtual desktop coordinates approach i32 limits.
fn safe_window_position(
    origin_x: i32,
    origin_y: i32,
    delta_x: i64,
    delta_y: i64,
) -> PhysicalPosition<i32> {
    let clamp = |v: i64| v.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
    PhysicalPosition::new(
        clamp(i64::from(origin_x) + delta_x),
        clamp(i64::from(origin_y) + delta_y),
    )
}

#[cfg(test)]
mod selection_tests {
    use super::*;

    fn monitor(id: u32, x: i32, primary: bool) -> MonitorInfo {
        MonitorInfo {
            id,
            name: format!("Monitor {id}"),
            x,
            y: 0,
            width: 1920,
            height: 1080,
            scale: 1.0,
            is_primary: primary,
        }
    }

    #[test]
    fn explicit_missing_monitor_never_falls_back_to_another_screen() {
        let monitors = [monitor(1, 0, true), monitor(2, -1920, false)];
        assert!(select_record_monitor(&monitors, Some(3), (10, 10)).is_err());
        assert_eq!(
            select_record_monitor(&monitors, Some(2), (10, 10))
                .unwrap()
                .id,
            2
        );
        assert_eq!(
            select_record_monitor(&monitors, None, (-500, 200))
                .unwrap()
                .id,
            2
        );
        assert_eq!(
            select_record_monitor(&monitors, None, (5000, 200))
                .unwrap()
                .id,
            1
        );
        assert!(select_record_monitor(&[], None, (0, 0)).is_err());
    }

    #[test]
    fn overlay_coordinates_are_clamped_without_wraparound() {
        let left = safe_window_position(i32::MIN, -100, -200, 50);
        let right = safe_window_position(i32::MAX, 100, 200, -50);
        assert_eq!((left.x, left.y), (i32::MIN, -50));
        assert_eq!((right.x, right.y), (i32::MAX, 50));
    }
}

/// Odredi monitor za snimanje: eksplicitni id, inače onaj pod mišem.
pub(super) fn resolve_target(
    app: &AppHandle,
    region: Option<Region>,
    monitor_id: Option<u32>,
) -> Result<RecordTarget, String> {
    let monitors = capture::list_monitors().map_err(estr)?;
    if let (Some(id), Some(selected_region)) = (monitor_id, region) {
        if id != selected_region.monitor_id {
            return Err("Selected recording region belongs to a different monitor".into());
        }
    }
    let wanted = monitor_id.or_else(|| region.map(|r| r.monitor_id));
    let cursor = if wanted.is_some() {
        (0, 0)
    } else {
        cursor_pos(app)
    };
    let m = select_record_monitor(&monitors, wanted, cursor)?;

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
    let offset_x = (i64::from(target.monitor_w) - i64::from(size.width)) / 2;
    let offset_y = i64::from(target.monitor_h) - i64::from(base_height) - 48;
    let pos = safe_window_position(target.monitor_x, target.monitor_y, offset_x, offset_y);
    win.set_position(pos).map_err(estr)?;
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
    let pos = safe_window_position(
        target.monitor_x,
        target.monitor_y,
        i64::from(ox),
        i64::from(oy),
    );

    ensure_rec_windows(app)?;
    let win = app
        .get_webview_window("recdraw")
        .ok_or("prozor za crtanje nedostaje")?;
    // Čist sloj za novo snimanje — anotacije prošlog ne smiju ostati.
    let _ = win.emit("snapvere:draw-clear", ());

    win.set_position(pos).map_err(estr)?;
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
