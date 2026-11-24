// Snapvere by Brendigo
//! Continuous consent-scoped Wayland capture. No unrestricted PipeWire fallback.
use super::pixels::allocate_bgra;
use super::RecordTarget;
use std::ffi::{c_int, c_void};
use std::ptr::NonNull;

unsafe extern "C" {
    fn snapvere_wayland_open(width: u32, height: u32) -> *mut c_void;
    fn snapvere_wayland_pull(
        handle: *mut c_void,
        data: *mut u8,
        capacity: usize,
        timeout_ms: u32,
    ) -> c_int;
    fn snapvere_wayland_free(handle: *mut c_void);
}

pub(super) fn active() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty())
        || std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland")
}

pub(super) struct PortalSource {
    handle: NonNull<c_void>,
    frame: Vec<u8>,
    width: u32,
    height: u32,
    seen: bool,
}

impl PortalSource {
    pub(super) fn open(target: &RecordTarget) -> Result<Self, String> {
        // Portal coordinates are logical, while existing redaction and crop
        // geometry is physical. Do not guess a mapping or silently pick a screen.
        if target.region.is_some() {
            return Err("Wayland recording requires a full monitor selection".into());
        }
        let monitors = xcap::Monitor::all().map_err(|error| error.to_string())?;
        if monitors.len() != 1 || monitors[0].id().ok() != Some(target.monitor_id) {
            return Err("Wayland recording currently requires one available monitor".into());
        }
        let frame = allocate_bgra(target.monitor_w, target.monitor_h)?;
        // SAFETY: the worker owns the portal session and its video pipeline.
        let handle =
            NonNull::new(unsafe { snapvere_wayland_open(target.monitor_w, target.monitor_h) })
                .ok_or("Screen sharing was declined or the Wayland video stream is unavailable")?;
        let mut source = Self {
            handle,
            frame,
            width: target.monitor_w,
            height: target.monitor_h,
            seen: false,
        };
        source.grab(2_000)?;
        if !source.seen {
            return Err("Wayland screen sharing did not provide a frame".into());
        }
        Ok(source)
    }

    pub(super) fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
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
