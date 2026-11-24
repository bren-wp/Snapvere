// Snapvere by Brendigo
//! Explicitly selected PipeWire inputs, a common mixer clock and bounded PCM.
use super::{Encoder, RecordOptions};
use std::collections::VecDeque;
use std::ffi::{c_int, c_void};
use std::ptr::NonNull;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const RATE: u64 = 48_000;
const FRAME_BYTES: usize = 4;
const MAX_PENDING: usize = 96_000;
const MAX_BLOCK: usize = 19_200;

unsafe extern "C" {
    fn snapvere_audio_open(mic: u64, monitor: u64) -> *mut c_void;
    fn snapvere_audio_pull(handle: *mut c_void, data: *mut u8, capacity: usize) -> c_int;
    fn snapvere_audio_free(handle: *mut c_void);
}

struct Capture(NonNull<c_void>);

impl Drop for Capture {
    fn drop(&mut self) {
        // SAFETY: uniquely owned pipeline, stopped before native memory is freed.
        unsafe { snapvere_audio_free(self.0.as_ptr()) };
    }
}

pub(super) struct Mixer {
    mic: u64,
    monitor: u64,
    capture: Option<Capture>,
    pending: VecDeque<u8>,
    written: u64,
}

impl Mixer {
    pub(super) fn selected(app: &AppHandle, opts: &RecordOptions) -> Result<Option<Self>, String> {
        if !opts.mic && !opts.system_audio {
            return Ok(None);
        }
        let store = app
            .store("settings.json")
            .map_err(|error| error.to_string())?;
        // Experimental configuration: no guessed default, no environment or
        // renderer-supplied pipeline strings. IDs must be selected explicitly.
        let read = |enabled: bool, key: &str| -> Result<u64, String> {
            if !enabled {
                return Ok(0);
            }
            store
                .get(key)
                .and_then(|value| value.as_u64())
                .filter(|serial| *serial != 0)
                .ok_or_else(|| format!("Select a PipeWire audio target: {key}"))
        };
        let mic = read(opts.mic, "linuxMicSerial")?;
        let monitor = read(opts.system_audio, "linuxMonitorSerial")?;
        if mic != 0 && mic == monitor {
            return Err("Microphone and monitor must be distinct PipeWire nodes".into());
        }
        Ok(Some(Self {
            mic,
            monitor,
            capture: None,
            pending: VecDeque::new(),
            written: 0,
        }))
    }

    pub(super) fn resume(&mut self) -> Result<(), String> {
        if self.capture.is_some() {
            return Err("PipeWire capture already active".into());
        }
        // SAFETY: numeric serials only; the native graph has no external URLs.
        let handle = NonNull::new(unsafe { snapvere_audio_open(self.mic, self.monitor) })
            .ok_or("Requested PipeWire input unavailable")?;
        self.capture = Some(Capture(handle));
        Ok(())
    }

    pub(super) fn pause(&mut self) {
        self.capture = None;
        self.pending.clear();
    }

    pub(super) fn pump(&mut self, encoder: &mut Encoder, video_end: i64) -> Result<(), String> {
        let capture = self.capture.as_ref().ok_or("PipeWire capture is paused")?;
        let mut block = [0_u8; MAX_BLOCK];
        for _ in 0..32 {
            // SAFETY: the native adapter validates capacity before copying.
            let size = unsafe {
                snapvere_audio_pull(capture.0.as_ptr(), block.as_mut_ptr(), block.len())
            };
            let size = usize::try_from(size).map_err(|_| "Requested PipeWire stream failed")?;
            if size == 0 {
                break;
            }
            if size > block.len() || !size.is_multiple_of(FRAME_BYTES) {
                return Err("Invalid PipeWire PCM block".into());
            }
            if self.pending.len() + size > MAX_PENDING {
                return Err("PipeWire audio backlog exceeded 500 ms".into());
            }
            self.pending.extend(&block[..size]);
        }
        let due = u64::try_from(video_end)
            .ok()
            .and_then(|ticks| ticks.checked_mul(RATE))
            .ok_or("Invalid video clock")?
            / 10_000_000;
        while self.written < due && !self.pending.is_empty() {
            let frames = (due - self.written).min((self.pending.len() / FRAME_BYTES) as u64);
            let bytes = (frames as usize * FRAME_BYTES).min(MAX_BLOCK);
            let pcm: Vec<u8> = self.pending.drain(..bytes).collect();
            encoder.write_pcm(&pcm)?;
            self.written += (bytes / FRAME_BYTES) as u64;
        }
        if due.saturating_sub(self.written) > RATE / 4 {
            return Err("PipeWire audio fell more than 250 ms behind video".into());
        }
        Ok(())
    }
}
