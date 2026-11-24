// Snapvere by Brendigo
//! Continuous consent-scoped Wayland capture. No unrestricted PipeWire fallback.
use super::pixels::allocate_bgra;
use super::RecordTarget;
use crate::models::MonitorInfo;
use std::ffi::{c_int, c_void};
use std::ptr::NonNull;
use std::time::{Duration, Instant};

unsafe extern "C" {
    fn snapvere_wayland_open(x: i32, y: i32, width: u32, height: u32) -> *mut c_void;
    fn snapvere_wayland_pull(
        handle: *mut c_void,
        data: *mut u8,
        capacity: usize,
        timeout_ms: u32,
    ) -> c_int;
    fn snapvere_wayland_discard(handle: *mut c_void) -> c_int;
    fn snapvere_wayland_free(handle: *mut c_void);
}

pub(crate) fn active() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty())
        || std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland")
}

// Match only a uniquely identified, non-overlapping monitor in a unit-scale
// topology. Xcap 0.9.10 reports a common Linux scale, not reliable independent
// physical origins at fractional DPI. Never infer missing compositor metadata.
pub(crate) fn validate_layout(
    target: &RecordTarget,
    monitors: &[MonitorInfo],
) -> Result<(), String> {
    if monitors.is_empty()
        || monitors
            .iter()
            .any(|m| m.scale != 1.0 || m.width == 0 || m.height == 0)
    {
        return Err("Wayland capture requires a verified unscaled monitor layout".into());
    }
    let mut selected = monitors.iter().filter(|m| m.id == target.monitor_id);
    let m = selected
        .next()
        .ok_or("Selected Wayland monitor disappeared")?;
    if selected.next().is_some()
        || (m.x, m.y, m.width, m.height)
            != (
                target.monitor_x,
                target.monitor_y,
                target.monitor_w,
                target.monitor_h,
            )
    {
        return Err("Selected Wayland monitor geometry changed".into());
    }
    let bounds = |m: &MonitorInfo| {
        let x = i64::from(m.x);
        let y = i64::from(m.y);
        (x, y, x + i64::from(m.width), y + i64::from(m.height))
    };
    let (left, top, right, bottom) = bounds(m);
    if monitors.iter().filter(|other| other.id != m.id).any(|other| {
        let (x, y, r, b) = bounds(other);
        left < r && x < right && top < b && y < bottom
    }) {
        return Err("Overlapping or mirrored Wayland monitors cannot be matched safely".into());
    }
    if let Some(region) = target.region {
        if region.monitor_id != m.id
            || region.x < 0
            || region.y < 0
            || region.width == 0
            || region.height == 0
            || i64::from(region.x) + i64::from(region.width) > i64::from(m.width)
            || i64::from(region.y) + i64::from(region.height) > i64::from(m.height)
        {
            return Err("Selected recording region is outside the authorized monitor".into());
        }
    }
    Ok(())
}

fn validate_current_layout(target: &RecordTarget) -> Result<(), String> {
    let monitors = crate::capture::list_monitors().map_err(|error| error.to_string())?;
    validate_layout(target, &monitors)
}

pub(super) struct PortalSource {
    handle: NonNull<c_void>,
    frame: Vec<u8>,
    width: u32,
    height: u32,
    seen: bool,
    target: RecordTarget,
    checked: Instant,
}

impl PortalSource {
    pub(super) fn open(target: &RecordTarget) -> Result<Self, String> {
        validate_current_layout(target)?;
        let frame = allocate_bgra(target.monitor_w, target.monitor_h)?;
        // SAFETY: the worker owns the portal session and its video pipeline.
        let handle = NonNull::new(unsafe {
            snapvere_wayland_open(
                target.monitor_x,
                target.monitor_y,
                target.monitor_w,
                target.monitor_h,
            )
        })
        .ok_or("Select the requested monitor in the screen sharing dialog")?;
        let mut source = Self {
            handle,
            frame,
            width: target.monitor_w,
            height: target.monitor_h,
            seen: false,
            target: *target,
            checked: Instant::now(),
        };
        // Revalidate after the user finishes the potentially long consent dialog.
        validate_current_layout(target)?;
        source.grab(2_000)?;
        if !source.seen {
            return Err("Wayland screen sharing did not provide a frame".into());
        }
        Ok(source)
    }

    pub(super) fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
        if self.checked.elapsed() >= Duration::from_secs(1) {
            validate_current_layout(&self.target)?;
            self.checked = Instant::now();
        }
        // SAFETY: C copies only validated BGRA rows into the owned buffer.
        let status = unsafe {
            snapvere_wayland_pull(
                self.handle.as_ptr(),
                self.frame.as_mut_ptr(),
                self.frame.len(),
                timeout_ms,
            )
        };
        match status {
            1 => self.seen = true,
            0 => {}
            _ => return Err("Wayland screen sharing ended or the frame format changed".into()),
        }
        Ok(&self.frame)
    }

    pub(super) fn discard(&mut self) -> Result<(), String> {
        if self.checked.elapsed() >= Duration::from_secs(1) {
            validate_current_layout(&self.target)?;
            self.checked = Instant::now();
        }
        if self.seen {
            self.frame.fill(0);
            self.seen = false;
        }
        // SAFETY: the worker owns the native session; discard copies no pixels.
        if unsafe { snapvere_wayland_discard(self.handle.as_ptr()) } != 0 {
            return Err("Wayland screen sharing ended".into());
        }
        Ok(())
    }

    pub(super) fn size(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    pub(super) fn has_frame(&self) -> bool {
        self.seen
    }
}

impl Drop for PortalSource {
    fn drop(&mut self) {
        // SAFETY: unique ownership; native teardown stops capture and closes consent.
        unsafe { snapvere_wayland_free(self.handle.as_ptr()) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Region;

    fn monitor(id: u32, x: i32, y: i32) -> MonitorInfo {
        MonitorInfo {
            id,
            name: format!("Monitor {id}"),
            x,
            y,
            width: 1920,
            height: 1080,
            scale: 1.0,
            is_primary: id == 1,
        }
    }

    fn target() -> RecordTarget {
        RecordTarget {
            monitor_id: 2,
            monitor_x: -1920,
            monitor_y: 0,
            monitor_w: 1920,
            monitor_h: 1080,
            region: Some(Region {
                monitor_id: 2,
                x: 100,
                y: 200,
                width: 800,
                height: 600,
            }),
        }
    }

    #[test]
    fn selects_negative_origin_monitor_and_exact_region() {
        let monitors = [monitor(1, 0, 0), monitor(2, -1920, 0)];
        let t = target();
        assert!(validate_layout(&t, &monitors).is_ok());
        assert_eq!(crate::record::crop_rect(&t).unwrap(), (100, 200, 800, 600));
    }

    #[test]
    fn rejects_mirror_hotplug_duplicate_and_non_unit_scale() {
        let t = target();
        assert!(validate_layout(&t, &[monitor(1, 0, 0)]).is_err());
        assert!(validate_layout(&t, &[monitor(1, -1920, 0), monitor(2, -1920, 0)]).is_err());
        assert!(validate_layout(&t, &[monitor(2, 0, 0), monitor(2, -1920, 0)]).is_err());
        let mut monitors = [monitor(1, 0, 0), monitor(2, -1920, 0)];
        for scale in [1.25, 1.5, 2.0, 0.0, f32::NAN] {
            monitors[0].scale = scale;
            assert!(validate_layout(&t, &monitors).is_err());
        }
        monitors[0].scale = 1.0;
        monitors[1].width = 1280;
        assert!(validate_layout(&t, &monitors).is_err());
    }

    #[test]
    fn rejects_outside_wrong_monitor_and_overflowing_regions() {
        let monitors = [monitor(1, 0, 0), monitor(2, -1920, 0)];
        let mut t = target();
        let original = t.region.unwrap();
        for region in [
            Region { x: -1, ..original },
            Region { monitor_id: 1, ..original },
            Region { width: u32::MAX, ..original },
            Region { y: i32::MAX, ..original },
            Region { width: 0, ..original },
        ] {
            t.region = Some(region);
            assert!(validate_layout(&t, &monitors).is_err());
        }
    }
}
