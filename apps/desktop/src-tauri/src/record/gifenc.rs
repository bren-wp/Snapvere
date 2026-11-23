// Snapvere by Brendigo
//! Animirani GIF izlaz.
//!
//! Cross-platform put (radi i kad Media Foundation nije dostupan) i namjerno ponuđen
//! izbor: GIF se lijepi izravno u Slack/GitHub/Jira bez playera. Cijena je veličina,
//! pa frameove skaliramo na razumnu širinu i kvantiziramo na 256 boja po frameu.

use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;

use gif::{DisposalMethod, Encoder, Frame, Repeat};

use crate::logging::log;

/// Najveća širina GIF-a; iznad ovoga datoteka postaje neupotrebljivo velika.
const MAX_WIDTH: u32 = 960;
/// Upper bound for capture geometry so malformed GPU buffers cannot exhaust RAM.
const MAX_SOURCE_DIMENSION: u32 = 16_384;
const MAX_SOURCE_PIXELS: u64 = 134_217_728;

/// GIF quality was previously ignored by the encoder despite being saved in
/// Settings. Use bounded output width and NeuQuant sampling effort for an
/// explicit file-size vs. visual-quality tradeoff on Windows and Linux.
/// Default quality 80 retains the established 960-pixel maximum.
fn gif_quality_profile(quality: u8) -> (u32, i32) {
    match quality.clamp(30, 100) {
        30..=49 => (480, 15),
        50..=69 => (720, 10),
        70..=89 => (MAX_WIDTH, 10),
        _ => (MAX_WIDTH, 3),
    }
}

fn input_frame_bytes(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 || width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION {
        return Err("GIF source dimensions exceed supported limits".into());
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_SOURCE_PIXELS {
        return Err("GIF input exceeds safe pixel count".into());
    }
    usize::try_from(pixels * 4).map_err(|_| "GIF pixel count overflow".into())
}

pub struct GifEncoder {
    /// `Option` da ga `finish()` može konzumirati: `Encoder::into_inner` zapisuje
    /// trailer i vraća writer, pa grešku zatvaranja vidimo umjesto da je Drop proguta.
    enc: Option<Encoder<BufWriter<File>>>,
    /// Izlazne dimenzije (mogu biti manje od ulaznih zbog skaliranja).
    out_w: u32,
    out_h: u32,
    src_w: u32,
    src_h: u32,
    delay_cs: u16,
    palette_speed: i32,
    /// Current frame buffer; reused to avoid allocating on every frame.
    rgba: Vec<u8>,
    /// Unchanged frames can share one GIF image descriptor with an accumulated
    /// delay. This dramatically reduces output size on static screens without
    /// speeding up or cutting any recorded playback time.
    pending_rgba: Option<Vec<u8>>,
    pending_delay_cs: u16,
}

impl GifEncoder {
    pub fn new(path: &Path, w: u32, h: u32, fps: u32, quality: u8) -> Result<Self, String> {
        input_frame_bytes(w, h)?;
        let (max_width, palette_speed) = gif_quality_profile(quality);
        let (out_w, out_h) = fit(w, h, max_width);
        // File::create truncates an existing recording or follows a symlink.
        // A capture must only create its own new file, never replace user data.
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| format!("GIF create: {e}"))?;
        let mut enc = Encoder::new(BufWriter::new(file), out_w as u16, out_h as u16, &[])
            .map_err(|e| format!("GIF encoder: {e}"))?;
        enc.set_repeat(Repeat::Infinite)
            .map_err(|e| format!("GIF repeat: {e}"))?;

        // GIF kašnjenje je u stotinkama sekunde; ispod 2 (50 fps) preglednici throttlaju.
        let delay_cs = ((100.0 / fps.max(1) as f64).round() as u16).max(2);

        log(&format!(
            "GIF enkoder: {w}x{h} → {out_w}x{out_h}, delay {delay_cs}cs → {}",
            path.display()
        ));

        Ok(Self {
            enc: Some(enc),
            out_w,
            out_h,
            src_w: w,
            src_h: h,
            delay_cs,
            palette_speed,
            rgba: vec![0u8; (out_w as usize) * (out_h as usize) * 4],
            pending_rgba: None,
            pending_delay_cs: 0,
        })
    }

    /// Accept one frame on every recorder tick. Consecutive identical pixels
    /// do not need separate GIF image descriptors: the pending frame's delay
    /// accumulates instead. Split the delay when it would exceed GIF's u16
    /// centisecond field, preserving long (10+ minute) static recordings.
    pub fn write(&mut self, bgra: &[u8]) -> Result<(), String> {
        let required = input_frame_bytes(self.src_w, self.src_h)?;
        if bgra.len() < required {
            return Err("GIF input frame is truncated".into());
        }
        self.fill_rgba(bgra);

        let unchanged = self
            .pending_rgba
            .as_ref()
            .is_some_and(|frame| frame.as_slice() == self.rgba.as_slice());
        let combined_delay = u32::from(self.pending_delay_cs) + u32::from(self.delay_cs);
        if unchanged && combined_delay <= u32::from(u16::MAX) {
            self.pending_delay_cs = combined_delay as u16;
            return Ok(());
        }

        // The previous frame is complete. Commit it *before* swapping the
        // reusable buffers. Only quantize changed frames, not every tick.
        self.flush_pending()?;
        let len = self.rgba.len();
        let pending = self.pending_rgba.get_or_insert_with(|| vec![0u8; len]);
        std::mem::swap(pending, &mut self.rgba);
        self.pending_delay_cs = self.delay_cs;
        Ok(())
    }

    fn flush_pending(&mut self) -> Result<(), String> {
        let Some(pending) = self.pending_rgba.as_mut() else {
            return Ok(());
        };
        let Some(enc) = self.enc.as_mut() else {
            return Err("GIF encoder is already closed".into());
        };
        let mut frame = Frame::from_rgba_speed(
            self.out_w as u16,
            self.out_h as u16,
            pending,
            self.palette_speed,
        );
        frame.delay = self.pending_delay_cs;
        frame.dispose = DisposalMethod::Any;
        enc.write_frame(&frame)
            .map_err(|e| format!("GIF write_frame: {e}"))
    }

    /// Flush the final pending frame, GIF trailer and buffered writer before
    /// worker-level sync_all() commits the file to the local gallery.
    pub fn finish(&mut self) -> Result<(), String> {
        if self.enc.is_none() {
            return Ok(());
        }
        self.flush_pending()?;
        let Some(enc) = self.enc.take() else {
            return Ok(());
        };
        let mut w = enc.into_inner().map_err(|e| format!("GIF trailer: {e}"))?;
        w.flush().map_err(|e| format!("GIF flush: {e}"))
    }

    /// BGRA (izvorna rezolucija) → RGBA (izlazna rezolucija), nearest-neighbour.
    fn fill_rgba(&mut self, bgra: &[u8]) {
        let sw = self.src_w as usize;
        let sh = self.src_h as usize;
        let ow = self.out_w as usize;
        let oh = self.out_h as usize;

        if ow == sw && oh == sh {
            let (destination_pixels, _) = self.rgba.as_chunks_mut::<4>();
            let (source_pixels, _) = bgra.as_chunks::<4>();
            for (d, s) in destination_pixels.iter_mut().zip(source_pixels.iter()) {
                d[0] = s[2];
                d[1] = s[1];
                d[2] = s[0];
                d[3] = 255;
            }
            return;
        }

        for y in 0..oh {
            let sy = y * sh / oh;
            let srow = sy * sw * 4;
            let drow = y * ow * 4;
            for x in 0..ow {
                let sx = x * sw / ow;
                let s = srow + sx * 4;
                let d = drow + x * 4;
                self.rgba[d] = bgra[s + 2];
                self.rgba[d + 1] = bgra[s + 1];
                self.rgba[d + 2] = bgra[s];
                self.rgba[d + 3] = 255;
            }
        }
    }
}

/// Skaliraj na najviše `MAX_WIDTH` uz očuvanje omjera (parne dimenzije radi urednosti).
fn fit(w: u32, h: u32, max_width: u32) -> (u32, u32) {
    if w <= max_width || w == 0 {
        return (w.max(1), h.max(1));
    }
    let nh = ((u64::from(h) * u64::from(max_width)) / u64::from(w)).max(1) as u32;
    (max_width, nh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gif_quality_now_affects_resolution_and_palette_cost() {
        assert_eq!(gif_quality_profile(30), (480, 15));
        assert_eq!(gif_quality_profile(60), (720, 10));
        assert_eq!(gif_quality_profile(80), (960, 10));
        assert_eq!(gif_quality_profile(100), (960, 3));
        assert_eq!(fit(1920, 1080, 480), (480, 270));
        assert_eq!(fit(1920, 1080, 720), (720, 405));
        assert_eq!(fit(1920, 1080, 960), (960, 540));
        assert_eq!(fit(400, 200, 960), (400, 200));
    }

    #[test]
    fn rejects_unbounded_capture_dimensions() {
        assert!(input_frame_bytes(0, 1080).is_err());
        assert!(input_frame_bytes(1920, 0).is_err());
        assert!(input_frame_bytes(16_385, 100).is_err());
        assert!(input_frame_bytes(16_384, 16_384).is_err());
        assert_eq!(input_frame_bytes(7680, 4320).unwrap(), 7680 * 4320 * 4);
    }

    #[test]
    fn refuses_to_overwrite_existing_recording() {
        let path = std::env::temp_dir().join(format!(
            "snapvere-gif-exclusive-{}.gif",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&path, b"keep original user data").expect("seed original file");
        assert!(GifEncoder::new(&path, 32, 32, 10, 80).is_err());
        assert_eq!(
            std::fs::read(&path).expect("original must remain readable"),
            b"keep original user data"
        );
        std::fs::remove_file(path).expect("cleanup original");
    }

    #[test]
    fn identical_frames_have_one_descriptor_and_full_playback_duration() {
        let path =
            std::env::temp_dir().join(format!("snapvere-gif-static-{}.gif", uuid::Uuid::new_v4()));
        let mut encoder = GifEncoder::new(&path, 32, 32, 10, 80).expect("gif encoder");
        let frame = vec![125u8; 32 * 32 * 4];
        for _ in 0..20 {
            encoder.write(&frame).expect("gif tick");
        }
        encoder.finish().expect("finish gif");
        drop(encoder);

        let file = File::open(&path).expect("recording");
        let mut reader = gif::DecodeOptions::new().read_info(file).expect("read gif");
        let first = reader.read_next_frame().expect("decode").expect("frame");
        assert_eq!(
            first.delay, 200,
            "20 ticks at 10 FPS must equal two seconds"
        );
        assert!(reader.read_next_frame().expect("decode end").is_none());
        std::fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn changed_pixels_flush_pending_frame_and_preserve_each_duration() {
        let path =
            std::env::temp_dir().join(format!("snapvere-gif-change-{}.gif", uuid::Uuid::new_v4()));
        let mut encoder = GifEncoder::new(&path, 16, 16, 10, 80).expect("gif encoder");
        let dark = vec![0u8; 16 * 16 * 4];
        let light = vec![255u8; 16 * 16 * 4];
        for _ in 0..4 {
            encoder.write(&dark).expect("first frame");
        }
        for _ in 0..3 {
            encoder.write(&light).expect("second frame");
        }
        encoder.finish().expect("finish gif");
        drop(encoder);

        let file = File::open(&path).expect("recording");
        let mut reader = gif::DecodeOptions::new().read_info(file).expect("read gif");
        let first = reader.read_next_frame().expect("decode").expect("first");
        assert_eq!(first.delay, 40);
        let second = reader.read_next_frame().expect("decode").expect("second");
        assert_eq!(second.delay, 30);
        assert!(reader.read_next_frame().expect("decode end").is_none());
        std::fs::remove_file(path).expect("cleanup");
    }
}
