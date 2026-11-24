// Snapvere by Brendigo
//! Opt-in Linux H.264 recorder, using the GStreamer C API.
//! No shell, filename interpolation, external recorder or network endpoint.
use rustix::fs::{linkat, openat, AtFlags, Mode, OFlags, CWD};
use std::ffi::{c_int, c_void, OsString};
use std::fs::File;
use std::os::fd::AsRawFd;
use std::path::Path;
use std::ptr::NonNull;

unsafe extern "C" {
    fn snapvere_mp4_open_av(
        fd: c_int,
        w: u32,
        h: u32,
        fps: u32,
        bitrate: u32,
        with_audio: c_int,
    ) -> *mut c_void;
    fn snapvere_mp4_push_pcm(encoder: *mut c_void, data: *const u8, len: usize) -> c_int;
    fn snapvere_mp4_push(
        encoder: *mut c_void,
        data: *const u8,
        len: usize,
        pts_ns: u64,
        duration_ns: u64,
    ) -> c_int;
    fn snapvere_mp4_finish(encoder: *mut c_void) -> c_int;
    fn snapvere_mp4_free(encoder: *mut c_void);
}

pub(super) struct LinuxMp4 {
    encoder: NonNull<c_void>,
    file: File,
    directory: File,
    name: OsString,
    frame_bytes: usize,
    last_pts: Option<u64>,
    published: bool,
    failed: bool,
}

impl LinuxMp4 {
    pub(super) fn new(
        path: &Path,
        w: u32,
        h: u32,
        fps: u32,
        quality: u8,
        with_audio: bool,
    ) -> Result<Self, String> {
        if !(16..=3840).contains(&w)
            || !(16..=2160).contains(&h)
            || !w.is_multiple_of(2)
            || !h.is_multiple_of(2)
        {
            return Err("Linux MP4 requires even dimensions from 16×16 to 3840×2160".into());
        }
        if !(5..=60).contains(&fps) {
            return Err("Invalid Linux MP4 frame rate".into());
        }
        let parent = path.parent().ok_or("Missing recording directory")?;
        let name = path.file_name().ok_or("Missing recording filename")?;
        let directory = File::from(
            rustix::fs::open(
                parent,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map_err(|e| e.to_string())?,
        );
        let file = File::from(
            openat(
                &directory,
                ".",
                OFlags::TMPFILE | OFlags::RDWR | OFlags::CLOEXEC,
                Mode::RUSR | Mode::WUSR,
            )
            .map_err(|e| format!("Secure recording staging unavailable: {e}"))?,
        );
        let bitrate =
            (u64::from(w) * u64::from(h) * u64::from(fps) * u64::from(quality.clamp(30, 100))
                / 1000)
                .clamp(256_000, 30_000_000) as u32;
        // SAFETY: file remains open until the native pipeline has stopped.
        let encoder = NonNull::new(unsafe {
            snapvere_mp4_open_av(
                file.as_raw_fd(),
                w,
                h,
                fps,
                bitrate,
                c_int::from(with_audio),
            )
        })
        .ok_or("Linux H.264/AAC encoder unavailable; check local GStreamer plugins")?;
        Ok(Self {
            encoder,
            file,
            directory,
            name: name.to_os_string(),
            frame_bytes: w as usize * h as usize * 4,
            last_pts: None,
            published: false,
            failed: false,
        })
    }

    pub(super) fn write(&mut self, bgra: &[u8], pts: i64, duration: i64) -> Result<(), String> {
        let timestamp = u64::try_from(pts).ok().and_then(|v| v.checked_mul(100));
        let duration = u64::try_from(duration)
            .ok()
            .and_then(|v| v.checked_mul(100));
        let (Some(timestamp), Some(duration)) = (timestamp, duration) else {
            self.failed = true;
            return Err("Invalid Linux MP4 timestamp".into());
        };
        if self.failed
            || self.published
            || bgra.len() != self.frame_bytes
            || duration == 0
            || self.last_pts.is_some_and(|last| timestamp <= last)
        {
            self.failed = true;
            return Err("Invalid Linux MP4 frame or encoder state".into());
        }
        // SAFETY: the live encoder copies exactly bgra.len() bytes synchronously.
        let status = unsafe {
            snapvere_mp4_push(
                self.encoder.as_ptr(),
                bgra.as_ptr(),
                bgra.len(),
                timestamp,
                duration,
            )
        };
        if status != 0 {
            self.failed = true;
            return Err(format!("Linux H.264 frame rejected (status {status})"));
        }
        self.last_pts = Some(timestamp);
        Ok(())
    }

    pub(super) fn write_pcm(&mut self, pcm: &[u8]) -> Result<(), String> {
        if self.failed || self.published {
            return Err("Linux MP4 encoder is not writable".into());
        }
        // SAFETY: the native adapter validates the length and copies the bytes.
        if unsafe { snapvere_mp4_push_pcm(self.encoder.as_ptr(), pcm.as_ptr(), pcm.len()) } != 0 {
            self.failed = true;
            return Err("Linux AAC rejected PCM audio".into());
        }
        Ok(())
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        if self.published {
            return Ok(());
        }
        if self.failed || self.last_pts.is_none() {
            return Err("Cannot publish failed or empty Linux MP4".into());
        }
        // Never retry a partially finalized pipeline.
        self.failed = true;
        // SAFETY: the encoder is owned by self and has not been finalized.
        if unsafe { snapvere_mp4_finish(self.encoder.as_ptr()) } != 0 {
            return Err("Linux MP4 finalization failed or timed out".into());
        }
        self.file.sync_all().map_err(|e| e.to_string())?;
        let descriptor = format!("/proc/self/fd/{}", self.file.as_raw_fd());
        linkat(
            CWD,
            descriptor.as_str(),
            &self.directory,
            self.name.as_os_str(),
            AtFlags::SYMLINK_FOLLOW,
        )
        .map_err(|e| format!("Could not publish Linux MP4: {e}"))?;
        self.published = true;
        if let Err(error) = self.directory.sync_all() {
            crate::logging::log(&format!(
                "MP4 published; directory sync unavailable: {error}"
            ));
        }
        Ok(())
    }
}

impl Drop for LinuxMp4 {
    fn drop(&mut self) {
        // SAFETY: the encoder is freed exactly once, before the file descriptor.
        unsafe { snapvere_mp4_free(self.encoder.as_ptr()) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_h264_mp4_and_keeps_output_unpublished_until_finish() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.mp4");
        let mut encoder = LinuxMp4::new(&path, 64, 48, 10, 80, false).unwrap();
        let mut frame = vec![0_u8; 64 * 48 * 4];
        for tick in 0..12 {
            for pixel in frame.as_chunks_mut::<4>().0 {
                *pixel = [tick as u8 * 16, 80, 200, 255];
            }
            encoder.write(&frame, tick * 1_000_000, 1_000_000).unwrap();
        }
        assert!(!path.exists());
        encoder.finish().unwrap();
        drop(encoder);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[4..8], b"ftyp");
        assert!(bytes.windows(4).any(|v| v == b"moov"));
        assert!(bytes.windows(4).any(|v| v == b"mdat"));
        if let Some(fixture) = std::env::var_os("SNAPVERE_TEST_MP4_PATH") {
            std::fs::copy(&path, fixture).unwrap();
        }
    }

    #[test]
    fn rust_encoder_muxes_pcm_and_video_without_publishing_early() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio-video.mp4");
        let mut encoder = LinuxMp4::new(&path, 64, 48, 10, 80, true).unwrap();
        let pixels = [128_u8; 64 * 48 * 4];
        let pcm = [0_u8; 4800 * 4];
        for tick in 0..12 {
            encoder.write(&pixels, tick * 1_000_000, 1_000_000).unwrap();
            encoder.write_pcm(&pcm).unwrap();
        }
        assert!(!path.exists());
        encoder.finish().unwrap();
        let bytes = std::fs::read(path).unwrap();
        assert!(bytes.windows(4).any(|v| v == b"mp4a"));
        assert!(bytes.windows(4).any(|v| v == b"avc1"));
    }

    #[test]
    fn rejects_malformed_frames_and_drops_unpublished_output() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.mp4");
        let mut encoder = LinuxMp4::new(&path, 64, 48, 10, 80, false).unwrap();
        assert!(encoder.write(&[0; 8], 0, 1_000_000).is_err());
        assert!(encoder.finish().is_err());
        drop(encoder);
        assert!(!path.exists());
    }

    #[test]
    fn rejects_existing_destination_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.mp4");
        std::fs::write(&path, b"original").unwrap();
        let mut encoder = LinuxMp4::new(&path, 64, 48, 10, 80, false).unwrap();
        encoder.write(&[0; 64 * 48 * 4], 0, 1_000_000).unwrap();
        assert!(encoder.finish().is_err());
        drop(encoder);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
    }
}
