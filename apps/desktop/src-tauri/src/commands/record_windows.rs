// Snapvere by Brendigo
//! Native recording-window geometry and per-monitor placement.

use super::{cursor_pos, ensure_rec_windows, estr, raise_topmost, REC_HUD_H, REC_HUD_W};
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

/// Calculate compact HUD geometry using the destination output's scale,
/// not the hidden toolbar's previous monitor. Never position it beyond the
/// monitor's physical bounds (a narrow output cannot fit the full toolbar).
fn hud_geometry(
    target: &RecordTarget,
    scale: f64,
) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    if !scale.is_finite() || !(0.5..=8.0).contains(&scale) {
        return Err("Invalid recording monitor scale".into());
    }
    let width = (f64::from(REC_HUD_W) * scale).round() as u32;
    let height = (f64::from(REC_HUD_H) * scale).round() as u32;
    if width > target.monitor_w || height > target.monitor_h {
        return Err("Recording monitor is too small for the toolbar".into());
    }
    let margin = ((48.0 * scale).round() as u32).min(target.monitor_h - height);
    let x = i64::from(target.monitor_w - width) / 2;
    let y = i64::from(target.monitor_h - height - margin);
    let pos = safe_window_position(target.monitor_x, target.monitor_y, x, y);
    Ok((pos, PhysicalSize::new(width, height)))
}

/// Mala uvijek-na-vrhu traka s tajmerom i kontrolama, na dnu snimanog monitora.
pub(super) fn show_rec_hud(app: &AppHandle, target: &RecordTarget) -> Result<(), String> {
    ensure_rec_windows(app)?;
    let win = app
        .get_webview_window("recbar")
        .ok_or("HUD prozor nedostaje")?;

    let monitors = win.available_monitors().map_err(estr)?;
    let mut matches = monitors.iter().filter(|monitor| {
        (monitor.position().x, monitor.position().y) == (target.monitor_x, target.monitor_y)
            && (monitor.size().width, monitor.size().height) == (target.monitor_w, target.monitor_h)
    });
    let monitor = matches
        .next()
        .ok_or("Recording toolbar monitor geometry is unavailable")?;
    if matches.next().is_some() {
        return Err("Recording toolbar monitor geometry is ambiguous".into());
    }
    let (pos, size) = hud_geometry(target, monitor.scale_factor())?;
    win.set_position(pos).map_err(estr)?;
    win.set_size(size).map_err(estr)?;
    win.show().map_err(estr)?;
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
    win.set_size(PhysicalSize::new(ow, oh)).map_err(estr)?;
    // Dok nije odabran alat sloj mora propuštati klikove — inače se ne može
    // raditi ništa drugo dok snimanje traje.
    win.set_ignore_cursor_events(true).map_err(estr)?;
    win.show().map_err(estr)?;
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
    fn hud_uses_destination_dpi_and_stays_inside_negative_origin_monitor() {
        let target = RecordTarget {
            monitor_id: 2,
            monitor_x: -2400,
            monitor_y: 0,
            monitor_w: 2400,
            monitor_h: 1350,
            region: None,
        };
        let (pos, size) = hud_geometry(&target, 1.25).unwrap();
        assert_eq!((size.width, size.height), (1025, 73));
        assert_eq!((pos.x, pos.y), (-1713, 1217));
        assert!(hud_geometry(&target, f64::NAN).is_err());
        assert!(hud_geometry(&target, 4.0).is_err());
    }

    #[test]
    fn overlay_coordinates_are_clamped_without_wraparound() {
        let left = safe_window_position(i32::MIN, -100, -200, 50);
        let right = safe_window_position(i32::MAX, 100, 200, -50);
        assert_eq!((left.x, left.y), (i32::MIN, -50));
        assert_eq!((right.x, right.y), (i32::MAX, 50));
    }
}
