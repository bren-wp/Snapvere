// Snapvere by Brendigo
//! Explicitly selected PipeWire inputs, a common mixer clock and bounded PCM.
use super::{Encoder, RecordOptions};
use crate::models::{LinuxAudioDevice, LinuxAudioSnapshot};
use std::collections::VecDeque;
use std::ffi::{c_int, c_void};
use std::ptr::NonNull;
use std::sync::Mutex;

const RATE: u64 = 48_000;
const FRAME_BYTES: usize = 4;
const MAX_PENDING: usize = 96_000;
const MAX_BLOCK: usize = 19_200;
const MAX_DEVICES: usize = 128;

#[repr(C)]
#[derive(Clone, Copy)]
struct NativeNode {
    serial: u64,
    role: u32,
    name: [u8; 256],
}

#[derive(Clone, Copy)]
struct Selection {
    mic: u64,
    monitor: u64,
    cookie: u32,
}

// Session-scoped consent only: never restore a stale serial from settings.json.
static SELECTED: Mutex<Option<Selection>> = Mutex::new(None);

unsafe extern "C" {
    fn snapvere_audio_list(nodes: *mut NativeNode, capacity: u32, cookie: *mut u32) -> c_int;
    fn snapvere_audio_validate(mic: u64, monitor: u64, cookie: u32, actual: *mut u32) -> c_int;
    fn snapvere_audio_open(mic: u64, monitor: u64, cookie: u32) -> *mut c_void;
    fn snapvere_audio_pull(handle: *mut c_void, data: *mut u8, capacity: usize) -> c_int;
    fn snapvere_audio_free(handle: *mut c_void);
}

pub(crate) fn devices() -> Result<LinuxAudioSnapshot, String> {
    let empty = NativeNode {
        serial: 0,
        role: 0,
        name: [0; 256],
    };
    let mut nodes = [empty; MAX_DEVICES];
    let mut cookie = 0;
    // SAFETY: the native registry writes at most MAX_DEVICES fixed-layout nodes.
    let count = unsafe {
        snapvere_audio_list(nodes.as_mut_ptr(), MAX_DEVICES as u32, &mut cookie)
    };
    let count = usize::try_from(count).map_err(|_| "Could not enumerate PipeWire devices")?;
    if count > MAX_DEVICES || cookie == 0 {
        return Err("Invalid PipeWire device snapshot".into());
    }
    let mut devices = Vec::with_capacity(count);
    for node in &nodes[..count] {
        let role = match node.role {
            1 => "microphone",
            2 => "monitor",
            _ => return Err("Invalid PipeWire audio role".into()),
        };
        if node.serial == 0 {
            return Err("Invalid PipeWire audio identity".into());
        }
        let end = node.name.iter().position(|byte| *byte == 0).unwrap_or(256);
        let name = String::from_utf8_lossy(&node.name[..end]);
        let name: String = name.chars().filter(|ch| !ch.is_control()).collect();
        devices.push(LinuxAudioDevice {
            serial: node.serial.to_string(),
            role,
            name,
        });
    }
    let selected = *crate::state::lock(&SELECTED);
    let selected = selected.filter(|value| value.cookie == cookie);
    Ok(LinuxAudioSnapshot {
        cookie,
        devices,
        microphone: selected.filter(|v| v.mic != 0).map(|v| v.mic.to_string()),
        monitor: selected
            .filter(|v| v.monitor != 0)
            .map(|v| v.monitor.to_string()),
    })
}

pub(crate) fn select(cookie: u32, mic: Option<String>, monitor: Option<String>) -> Result<(), String> {
    let parse = |value: Option<String>| -> Result<u64, String> {
        match value {
            None => Ok(0),
            Some(value) => {
                let serial = value.parse::<u64>().map_err(|_| "Invalid audio serial")?;
                if serial == 0 || serial.to_string() != value {
                    return Err("Invalid audio serial".into());
                }
                Ok(serial)
            }
        }
    };
    let mic = parse(mic)?;
    let monitor = parse(monitor)?;
    if cookie == 0 {
        return Err("Invalid PipeWire session".into());
    }
    if mic == 0 && monitor == 0 {
        *crate::state::lock(&SELECTED) = None;
        return Ok(());
    }
    // SAFETY: no pointers are dereferenced for a null optional cookie output.
    if unsafe { snapvere_audio_validate(mic, monitor, cookie, std::ptr::null_mut()) } != 0 {
        return Err("Selected PipeWire device is no longer available".into());
    }
    *crate::state::lock(&SELECTED) = Some(Selection {
        mic,
        monitor,
        cookie,
    });
    Ok(())
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
    cookie: u32,
    capture: Option<Capture>,
    pending: VecDeque<u8>,
    written: u64,
}

impl Mixer {
    pub(super) fn selected(opts: &RecordOptions) -> Result<Option<Self>, String> {
        if !opts.mic && !opts.system_audio {
            return Ok(None);
        }
        let selection = (*crate::state::lock(&SELECTED))
            .ok_or("Select audio targets in the current PipeWire session")?;
        let mic = if opts.mic { selection.mic } else { 0 };
        let monitor = if opts.system_audio { selection.monitor } else { 0 };
        if (opts.mic && mic == 0) || (opts.system_audio && monitor == 0) {
            return Err("Select every requested audio device before recording".into());
        }
        Ok(Some(Self {
            mic,
            monitor,
            cookie: selection.cookie,
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
        let handle =
            NonNull::new(unsafe { snapvere_audio_open(self.mic, self.monitor, self.cookie) })
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
            let size =
                unsafe { snapvere_audio_pull(capture.0.as_ptr(), block.as_mut_ptr(), block.len()) };
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
