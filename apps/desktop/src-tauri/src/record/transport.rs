// Snapvere by Brendigo
//! Native screen-source and encoder adapters used by the recorder.

use super::gifenc;
use super::pixels::allocate_bgra;
use super::RecordTarget;
#[cfg(windows)]
use super::{dxgi, mp4};
#[cfg(windows)]
use crate::logging::log;

/// Izvor frameova. BGRA, gusto pakiran, dimenzije cijelog monitora.
pub(super) enum Source {
    #[cfg(windows)]
    Dxgi(Box<dxgi::DxgiGrabber>),
    /// Fallback: xcap BitBlt petlja (sporije, ali radi kad duplikacija nije dostupna —
    /// npr. RDP sesija ili zaključan output).
    Xcap {
        monitor: xcap::Monitor,
        buf: Vec<u8>,
        w: u32,
        h: u32,
    },
}

impl Source {
    pub(super) fn open(target: &RecordTarget) -> Result<Self, String> {
        #[cfg(windows)]
        {
            match dxgi::DxgiGrabber::new(target.monitor_x, target.monitor_y) {
                Ok(g) => return Ok(Source::Dxgi(Box::new(g))),
                Err(e) => log(&format!("DXGI nedostupan ({e}); prelazim na xcap fallback")),
            }
        }

        let monitors = xcap::Monitor::all().map_err(|e| format!("xcap monitors: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.id().map(|id| id == target.monitor_id).unwrap_or(false))
            .ok_or("monitor za snimanje nije pronađen")?;
        let buf = allocate_bgra(target.monitor_w, target.monitor_h)?;
        Ok(Source::Xcap {
            monitor,
            buf,
            w: target.monitor_w,
            h: target.monitor_h,
        })
    }

    pub(super) fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
        #[cfg(not(windows))]
        let _ = timeout_ms;
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => g.grab(timeout_ms),
            Source::Xcap { monitor, buf, w, h } => {
                let img = monitor
                    .capture_image()
                    .map_err(|e| format!("xcap capture: {e}"))?;
                let iw = img.width().min(*w) as usize;
                let ih = img.height().min(*h) as usize;
                let src = img.as_raw();
                let sw = img.width() as usize;
                let dw = *w as usize;
                // Clear only short frames; otherwise previous pixels could leak.
                if iw < dw || ih < *h as usize {
                    buf.fill(0);
                }
                // RGBA → BGRA
                for y in 0..ih {
                    for x in 0..iw {
                        let s = (y * sw + x) * 4;
                        let d = (y * dw + x) * 4;
                        buf[d] = src[s + 2];
                        buf[d + 1] = src[s + 1];
                        buf[d + 2] = src[s];
                        buf[d + 3] = 255;
                    }
                }
                Ok(buf)
            }
        }
    }

    pub(super) fn size(&self) -> (u32, u32) {
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => (g.width, g.height),
            Source::Xcap { w, h, .. } => (*w, *h),
        }
    }

    /// Ima li izvor stvarnu sliku (DXGI na statičnom ekranu prvo neko vrijeme nema).
    pub(super) fn has_frame(&self) -> bool {
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => g.has_frame(),
            Source::Xcap { .. } => true,
        }
    }
}

/// Enkoder — MP4 na Windowsu, GIF svugdje.
pub(super) enum Encoder {
    #[cfg(windows)]
    Mp4(Box<mp4::Mp4Encoder>),
    Gif(Box<gifenc::GifEncoder>),
}

impl Encoder {
    pub(super) fn write(
        &mut self,
        bgra: &[u8],
        time_100ns: i64,
        dur_100ns: i64,
    ) -> Result<(), String> {
        #[cfg(not(windows))]
        let _ = (time_100ns, dur_100ns);
        match self {
            #[cfg(windows)]
            Encoder::Mp4(e) => e.write(bgra, time_100ns, dur_100ns),
            Encoder::Gif(e) => e.write(bgra),
        }
    }

    #[cfg(windows)]
    pub(super) fn write_audio(
        &mut self,
        pcm: &[i16],
        time_100ns: i64,
        dur_100ns: i64,
    ) -> Result<(), String> {
        match self {
            #[cfg(windows)]
            Encoder::Mp4(e) => e.write_audio(pcm, time_100ns, dur_100ns),
            Encoder::Gif(_) => Ok(()),
        }
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        match self {
            #[cfg(windows)]
            Encoder::Mp4(e) => e.finish(),
            Encoder::Gif(e) => e.finish(),
        }
    }
}
