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
                // A changed monitor geometry invalidates crop and redaction
                // coordinates. Stop rather than encode pixels from a different
                // region or silently pad a partial frame.
                rgba_to_bgra_frame(&img, *w, *h, buf)?;
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
