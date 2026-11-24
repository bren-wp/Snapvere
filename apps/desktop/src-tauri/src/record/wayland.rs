// Snapvere by Brendigo
//! Continuous consent-scoped Wayland capture. No unrestricted PipeWire fallback.
use super::pixels::allocate_bgra;
pub(crate) use super::wayland_outputs::OutputGeometry;
use super::RecordTarget;
use crate::models::{LogicalRecordingSelection, Region};
use std::ffi::{c_int, c_void};
use std::ptr::NonNull;
use std::time::{Duration, Instant};

unsafe extern "C" {
    fn snapvere_wayland_open(
        x: i32,
        y: i32,
        logical_width: u32,
        logical_height: u32,
        width: u32,
        height: u32,
    ) -> *mut c_void;
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

/// Resolve the explicitly requested Xcap monitor by connector name, not by
/// Xwayland's globally scaled coordinates. Do not substitute another output.
pub(crate) fn output_for_monitor(name: &str) -> Result<OutputGeometry, String> {
    let outputs = super::wayland_outputs::snapshot()?;
    let mut matches = outputs.iter().filter(|output| output.name == name);
    let output = matches
        .next()
        .ok_or("Native Wayland monitor name does not match")?;
    if matches.next().is_some() {
        return Err("Ambiguous Wayland monitor identity".into());
    }
    verify_layout(&outputs, output)?;
    Ok(output.clone())
}

fn verify_layout(outputs: &[OutputGeometry], output: &OutputGeometry) -> Result<(), String> {
    let selected = super::wayland_outputs::select(
        outputs,
        output.origin.0,
        output.origin.1,
        output.logical.0,
        output.logical.1,
    )?;
    if selected != output {
        return Err("Wayland monitor identity or geometry changed".into());
    }
    let bounds = |o: &OutputGeometry| {
        let x = i64::from(o.origin.0);
        let y = i64::from(o.origin.1);
        (x, y, x + i64::from(o.logical.0), y + i64::from(o.logical.1))
    };
    let (left, top, right, bottom) = bounds(output);
    if outputs.iter().filter(|o| o.name != output.name).any(|o| {
        let (x, y, r, b) = bounds(o);
        left < r && x < right && top < b && y < bottom
    }) {
        return Err("Overlapping or mirrored Wayland monitors cannot be matched safely".into());
    }
    Ok(())
}

/// The encoder and crop engine use only physical pixels. The portal retains
/// the original logical geometry in the separately owned output binding.
pub(crate) fn map_target(
    mut target: RecordTarget,
    output: &OutputGeometry,
    selection: Option<LogicalRecordingSelection>,
) -> Result<RecordTarget, String> {
    if target.region.is_some() != selection.is_some() {
        return Err("Missing or unexpected logical recording selection".into());
    }
    target.monitor_w = output.physical.0;
    target.monitor_h = output.physical.1;
    if let Some(selection) = selection {
        if selection.monitor_id != target.monitor_id
            || (selection.viewport_width, selection.viewport_height) != output.logical
        {
            return Err("Wayland selection viewport does not match the monitor".into());
        }
        let (x, y, w, h) =
            output.inward_crop(selection.x, selection.y, selection.width, selection.height)?;
        target.region = Some(Region {
            monitor_id: target.monitor_id,
            x: i32::try_from(x).map_err(|_| "Wayland crop x overflow")?,
            y: i32::try_from(y).map_err(|_| "Wayland crop y overflow")?,
            width: w,
            height: h,
        });
    }
    // The existing crop engine validates allocations and shrinks odd extents.
    super::crop_rect(&target)?;
    Ok(target)
}

pub(super) struct PortalSource {
    handle: NonNull<c_void>,
    frame: Vec<u8>,
    width: u32,
    height: u32,
    seen: bool,
    output: OutputGeometry,
    checked: Instant,
}

impl PortalSource {
    pub(super) fn open(target: &RecordTarget, output: OutputGeometry) -> Result<Self, String> {
        verify_layout(&super::wayland_outputs::snapshot()?, &output)?;
        if output.physical != (target.monitor_w, target.monitor_h) {
            return Err("Wayland encoder dimensions do not match the bound output".into());
        }
        let frame = allocate_bgra(target.monitor_w, target.monitor_h)?;
        // SAFETY: the worker owns the portal session and its video pipeline.
        let handle = NonNull::new(unsafe {
            snapvere_wayland_open(
                output.origin.0,
                output.origin.1,
                output.logical.0,
                output.logical.1,
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
            output,
            checked: Instant::now(),
        };
        // Revalidate after the user finishes the potentially long consent dialog.
        source.verify_output()?;
        source.grab(2_000)?;
        if !source.seen {
            return Err("Wayland screen sharing did not provide a frame".into());
        }
        Ok(source)
    }

    fn verify_output(&mut self) -> Result<(), String> {
        verify_layout(&super::wayland_outputs::snapshot()?, &self.output)?;
        self.checked = Instant::now();
        Ok(())
    }

    pub(super) fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
        if self.checked.elapsed() >= Duration::from_secs(1) {
            self.verify_output()?;
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
            self.verify_output()?;
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

    fn output() -> OutputGeometry {
        OutputGeometry {
            name: "DP-2".into(),
            origin: (-1920, 0),
            logical: (1920, 1080),
            physical: (2400, 1350),
            transform: 0,
        }
    }

    fn target() -> RecordTarget {
        RecordTarget {
            monitor_id: 2,
            monitor_x: -2400,
            monitor_y: 0,
            monitor_w: 1920,
            monitor_h: 1080,
            region: Some(Region {
                monitor_id: 2,
                x: 1,
                y: 1,
                width: 101,
                height: 101,
            }),
        }
    }

    fn selection() -> LogicalRecordingSelection {
        LogicalRecordingSelection {
            monitor_id: 2,
            x: 1,
            y: 1,
            width: 101,
            height: 101,
            viewport_width: 1920,
            viewport_height: 1080,
        }
    }

    #[test]
    fn logical_selection_maps_to_the_actual_encoder_crop() {
        let mapped = map_target(target(), &output(), Some(selection())).unwrap();
        assert_eq!((mapped.monitor_w, mapped.monitor_h), (2400, 1350));
        assert_eq!(super::super::crop_rect(&mapped).unwrap(), (2, 2, 124, 124));
        // Encode only the selected physical pixels, never an expanded rectangle.
        let mut src = vec![99; 2400 * 1350 * 4];
        for y in 2..126 {
            for x in 2..126 {
                src[(y * 2400 + x) * 4..(y * 2400 + x + 1) * 4].fill(7);
            }
        }
        let mut dst = vec![0; 124 * 124 * 4];
        super::super::pixels::crop_bgra(&src, 2400, 1350, 2, 2, 124, 124, &mut dst);
        assert!(dst.iter().all(|value| *value == 7));
    }

    #[test]
    fn rejects_mismatched_viewport_and_unbound_region() {
        let mut selection = selection();
        selection.viewport_width = 1280;
        assert!(map_target(target(), &output(), Some(selection)).is_err());
        assert!(map_target(target(), &output(), None).is_err());
    }

    #[test]
    fn rejects_mirrored_or_replaced_outputs() {
        let expected = output();
        let mut replacement = expected.clone();
        replacement.name = "DP-3".into();
        assert!(verify_layout(&[replacement.clone()], &expected).is_err());
        assert!(verify_layout(&[expected.clone(), replacement], &expected).is_err());
    }
}
