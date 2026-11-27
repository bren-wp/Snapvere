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
    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    Wayland(Box<super::wayland::PortalSource>),
    /// Fallback: xcap BitBlt petlja (sporije, ali radi kad duplikacija nije dostupna —
    /// npr. RDP sesija ili zaključan output).
    Xcap {
        monitor: xcap::Monitor,
        buf: Vec<u8>,
        target: RecordTarget,
    },
}

impl Source {
    pub(super) fn open(target: &RecordTarget) -> Result<Self, String> {
        #[cfg(target_os = "macos")]
        crate::macos_permissions::require_screen_capture()?;
        #[cfg(windows)]
        {
            match dxgi::DxgiGrabber::new(target.monitor_x, target.monitor_y) {
                Ok(g) => return Ok(Source::Dxgi(Box::new(g))),
                Err(e) => log(&format!("DXGI nedostupan ({e}); prelazim na xcap fallback")),
            }
        }

        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        if super::wayland::active() {
            return Err("Wayland recording requires a bound native output".into());
        }

        let monitors = xcap::Monitor::all().map_err(|e| format!("xcap monitors: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.id().map(|id| id == target.monitor_id).unwrap_or(false))
            .ok_or("monitor za snimanje nije pronađen")?;
        verify_monitor(&monitor, target)?;
        let buf = allocate_bgra(target.monitor_w, target.monitor_h)?;
        Ok(Source::Xcap {
            monitor,
            buf,
            target: *target,
        })
    }

    pub(super) fn grab(&mut self, timeout_ms: u32) -> Result<&[u8], String> {
        #[cfg(not(windows))]
        let _ = timeout_ms;
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => g.grab(timeout_ms),
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Source::Wayland(g) => g.grab(timeout_ms),
            Source::Xcap {
                monitor,
                buf,
                target,
            } => {
                #[cfg(target_os = "macos")]
                crate::macos_permissions::require_screen_capture()?;
                verify_monitor(monitor, target)?;
                let img = monitor
                    .capture_image()
                    .map_err(|e| format!("xcap capture: {e}"))?;
                #[cfg(target_os = "macos")]
                crate::macos_permissions::require_screen_capture()?;
                // A changed monitor geometry invalidates crop and redaction
                // coordinates. Stop rather than encode pixels from a different
                // region or silently pad a partial frame.
                verify_monitor(monitor, target)?;
                rgba_to_bgra_frame(&img, target.monitor_w, target.monitor_h, buf)?;
                Ok(buf)
            }
        }
    }

    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    pub(super) fn discard_paused(&mut self) -> Result<(), String> {
        if let Source::Wayland(source) = self {
            source.discard()?;
        }
        Ok(())
    }

    pub(super) fn size(&self) -> (u32, u32) {
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => (g.width, g.height),
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Source::Wayland(g) => g.size(),
            Source::Xcap { target, .. } => (target.monitor_w, target.monitor_h),
        }
    }

    /// Ima li izvor stvarnu sliku (DXGI na statičnom ekranu prvo neko vrijeme nema).
    pub(super) fn has_frame(&self) -> bool {
        match self {
            #[cfg(windows)]
            Source::Dxgi(g) => g.has_frame(),
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Source::Wayland(g) => g.has_frame(),
            Source::Xcap { .. } => true,
        }
    }
}

fn verify_monitor(monitor: &xcap::Monitor, target: &RecordTarget) -> Result<(), String> {
    let geometry_matches = monitor.id().ok() == Some(target.monitor_id)
        && monitor.x().ok() == Some(target.monitor_x)
        && monitor.y().ok() == Some(target.monitor_y)
        && monitor.width().ok() == Some(target.monitor_w)
        && monitor.height().ok() == Some(target.monitor_h);
    if !geometry_matches {
        return Err(
            "Capture monitor changed; restart recording to protect the selected region".into(),
        );
    }
    Ok(())
}

fn rgba_to_bgra_frame(
    image: &image::RgbaImage,
    width: u32,
    height: u32,
    destination: &mut [u8],
) -> Result<(), String> {
    if image.dimensions() != (width, height) || image.as_raw().len() != destination.len() {
        return Err(
            "Capture dimensions changed; restart recording to protect the selected region".into(),
        );
    }
    let (source, _) = image.as_raw().as_chunks::<4>();
    let (target, _) = destination.as_chunks_mut::<4>();
    for (source, target) in source.iter().zip(target.iter_mut()) {
        *target = [source[2], source[1], source[0], 255];
    }
    Ok(())
}

/// Enkoder — MP4 na Windowsu, GIF svugdje.
pub(super) enum Encoder {
    #[cfg(windows)]
    Mp4(Box<mp4::Mp4Encoder>),
    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    LinuxMp4(Box<super::linux_mp4::LinuxMp4>),
    Gif(Box<gifenc::GifEncoder>),
}

impl Encoder {
    pub(super) fn preview_pts_100ns(&self, frame_id: u64, input_pts: u64) -> u64 {
        #[cfg(not(any(windows, all(target_os = "linux", feature = "linux-native-media"))))]
        let _ = input_pts;
        match self {
            Encoder::Gif(encoder) => encoder.presentation_pts_100ns(frame_id),
            #[cfg(windows)]
            Encoder::Mp4(_) => input_pts,
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Encoder::LinuxMp4(_) => input_pts,
        }
    }

    pub(super) fn write(
        &mut self,
        bgra: &[u8],
        time_100ns: i64,
        dur_100ns: i64,
    ) -> Result<(), String> {
        #[cfg(not(any(windows, all(target_os = "linux", feature = "linux-native-media"))))]
        let _ = (time_100ns, dur_100ns);
        match self {
            #[cfg(windows)]
            Encoder::Mp4(e) => e.write(bgra, time_100ns, dur_100ns),
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Encoder::LinuxMp4(e) => e.write(bgra, time_100ns, dur_100ns),
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

    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    pub(super) fn write_pcm(&mut self, pcm: &[u8]) -> Result<(), String> {
        match self {
            Encoder::LinuxMp4(encoder) => encoder.write_pcm(pcm),
            Encoder::Gif(_) => Err("GIF does not support PCM audio".into()),
        }
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        match self {
            #[cfg(windows)]
            Encoder::Mp4(e) => e.finish(),
            #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
            Encoder::LinuxMp4(e) => e.finish(),
            Encoder::Gif(e) => e.finish(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "requires the dedicated Xvfb display and known root pixels"]
    fn native_x11_capture_checks_real_pixels_and_monitor_identity() {
        let monitor = xcap::Monitor::all().unwrap().into_iter().next().unwrap();
        let target = RecordTarget {
            monitor_id: monitor.id().unwrap(),
            monitor_x: monitor.x().unwrap(),
            monitor_y: monitor.y().unwrap(),
            monitor_w: monitor.width().unwrap(),
            monitor_h: monitor.height().unwrap(),
            region: None,
        };
        let mut source = Source::open(&target).unwrap();
        assert_eq!(source.size(), (640, 480));
        let frame = source.grab(100).unwrap();
        assert_eq!(frame.len(), 640 * 480 * 4);
        // The CI display root is painted #123456 using xsetroot.
        assert_eq!(&frame[..4], &[0x56, 0x34, 0x12, 255]);
        let mut stale = target;
        stale.monitor_x += 1;
        assert!(Source::open(&stale).is_err());
    }

    #[test]
    fn capture_frame_rejects_geometry_changes_before_touching_destination() {
        let frame = image::RgbaImage::from_pixel(2, 1, image::Rgba([10, 20, 30, 40]));
        let mut output = [99; 8];
        assert!(rgba_to_bgra_frame(&frame, 1, 2, &mut output).is_err());
        assert_eq!(output, [99; 8]);
        assert!(rgba_to_bgra_frame(&frame, 2, 1, &mut output[..4]).is_err());
        rgba_to_bgra_frame(&frame, 2, 1, &mut output).unwrap();
        assert_eq!(output, [30, 20, 10, 255, 30, 20, 10, 255]);
    }
}
