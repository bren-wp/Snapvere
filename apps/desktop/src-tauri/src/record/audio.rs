// Snapvere by Brendigo
//! Hvatanje zvuka preko WASAPI-ja: mikrofon (capture endpoint) i sistemski zvuk
//! (render endpoint u loopback modu). Svaki izvor ima svoju dretvu koja puni red
//! u zajedničkom formatu (48 kHz, stereo, f32); `Mixer::pull` ih zbraja u PCM16
//! koji ide u AAC stream MP4 enkodera.
//!
//! Satovi uređaja nisu isti kao sat videa, pa se ne vežemo na njihove timestampove:
//! video petlja vuče točno onoliko frameova koliko je proteklo medijskog vremena,
//! a manjak se popuni tišinom (loopback bez reprodukcije često ne šalje ništa).

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

use crate::logging::log;

mod format;
use format::{read_format, SourceFormat};

/// Format u koji se sve svodi (AAC enkoder prima 44.1/48 kHz, 1-2 kanala, PCM16).
pub const RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
/// Više od ovoga u redu = zaostatak (npr. nakon pauze) → odbaci najstarije.
pub(super) const MAX_QUEUED_FRAMES: usize = RATE as usize * 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Microphone,
    SystemLoopback,
}

impl Kind {
    fn label(self) -> &'static str {
        match self {
            Kind::Microphone => "mikrofon",
            Kind::SystemLoopback => "sistemski zvuk",
        }
    }
}

/// Jedan red uzoraka (interleaved stereo f32 @ 48 kHz) koji puni dretva za hvatanje.
struct Queue {
    samples: Mutex<VecDeque<f32>>,
}

/// Zbraja sve aktivne izvore u jedan PCM16 stereo tok.
pub struct Mixer {
    queues: Vec<Arc<Queue>>,
    stop: Arc<AtomicBool>,
    threads: Vec<std::thread::JoinHandle<()>>,
    failure: Arc<Mutex<Option<String>>>,
    pub kinds: Vec<Kind>,
    gains: [f32; 2],
}

impl Mixer {
    /// Open sources and track failures that happen after WASAPI initialization.
    /// The caller rejects unavailable audio that was explicitly requested.
    pub fn start(kinds: &[Kind]) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let failure = Arc::new(Mutex::new(None));
        let mut queues = Vec::new();
        let mut threads = Vec::new();
        let mut opened = Vec::new();

        for &kind in kinds {
            let queue = Arc::new(Queue {
                samples: Mutex::new(VecDeque::new()),
            });
            let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
            let q = Arc::clone(&queue);
            let st = Arc::clone(&stop);
            let health = Arc::clone(&failure);
            let handle = match std::thread::Builder::new()
                .name(format!("snapvere-audio-{kind:?}"))
                .spawn(move || capture_thread(kind, q, st, ready_tx, health))
            {
                Ok(h) => h,
                Err(e) => {
                    log(&format!(
                        "audio: dretva za {} nije pokrenuta — {e}",
                        kind.label()
                    ));
                    continue;
                }
            };

            match ready_rx.recv_timeout(Duration::from_secs(3)) {
                Ok(Ok(())) => {
                    queues.push(queue);
                    threads.push(handle);
                    opened.push(kind);
                }
                Ok(Err(e)) => log(&format!("audio: {} nije dostupan — {e}", kind.label())),
                Err(_) => log(&format!("audio: {} se nije javio u 3 s", kind.label())),
            }
        }

        Self {
            queues,
            stop,
            threads,
            failure,
            kinds: opened,
            gains: [1.0; 2],
        }
    }

    /// Snapshot Pro-only preferences at recording start, never during mixing.
    /// These values do not select or authorize any additional audio source.
    #[cfg(feature = "pro")]
    pub(super) fn with_saved_gains(mut self, app: &tauri::AppHandle) -> Result<Self, String> {
        use tauri_plugin_store::StoreExt;
        let store = app
            .store("settings.json")
            .map_err(|error| error.to_string())?;
        self.gains = [
            gain_from_percent(store.get("proMicGain").and_then(|v| v.as_u64())),
            gain_from_percent(store.get("proSystemGain").and_then(|v| v.as_u64())),
        ];
        Ok(self)
    }

    pub fn is_empty(&self) -> bool {
        self.queues.is_empty()
    }

    /// Errors from either selected source must reach the encoder and UI.
    pub fn check_health(&self) -> Result<(), String> {
        if let Some(error) = crate::state::lock(&self.failure).as_ref() {
            return Err(error.clone());
        }
        if self.threads.iter().any(|worker| worker.is_finished()) {
            return Err("A requested WASAPI audio capture thread exited unexpectedly".into());
        }
        Ok(())
    }

    /// Odbaci sve što čeka u redovima (poravnanje sa satom videa, izlazak iz pauze).
    pub fn clear(&self) {
        for q in &self.queues {
            crate::state::lock(&q.samples).clear();
        }
    }

    /// Izvuci točno `frames` stereo frameova kao PCM16. Manjak = tišina.
    pub fn pull(&self, frames: usize) -> Vec<i16> {
        let n = frames * CHANNELS;
        let mut mix = vec![0f32; n];
        for (index, q) in self.queues.iter().enumerate() {
            let gain = match self.kinds.get(index) {
                Some(Kind::Microphone) => self.gains[0],
                Some(Kind::SystemLoopback) => self.gains[1],
                None => 1.0,
            };
            let mut samples = crate::state::lock(&q.samples);
            for slot in mix.iter_mut().take(n) {
                match samples.pop_front() {
                    Some(s) if s.is_finite() => *slot += s.clamp(-1.0, 1.0) * gain,
                    Some(_) => {}
                    None => break,
                }
            }
        }
        mix.iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect()
    }
}

#[cfg(any(feature = "pro", test))]
fn gain_from_percent(value: Option<u64>) -> f32 {
    match value {
        Some(percent @ 0..=200) => percent as f32 / 100.0,
        _ => 1.0,
    }
}

/// Constrain a device packet to the maximum duration the mixer can retain.
/// A corrupt driver frame count must never trigger an unbounded allocation.
fn validate_packet_frames(frames: u32, sample_rate: u32) -> Result<(), String> {
    if sample_rate == 0 || frames > sample_rate.saturating_mul(2) {
        return Err(format!(
            "WASAPI packet contains {frames} frames at {sample_rate} Hz (maximum 2 seconds)"
        ));
    }
    Ok(())
}

impl Drop for Mixer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
    }
}

// ────────────────────────────── dretva za hvatanje ──────────────────────────────

fn capture_thread(
    kind: Kind,
    queue: Arc<Queue>,
    stop: Arc<AtomicBool>,
    ready: std::sync::mpsc::Sender<Result<(), String>>,
    failure: Arc<Mutex<Option<String>>>,
) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let (client, capture, fmt) = match open(kind) {
        Ok(v) => v,
        Err(e) => {
            let _ = ready.send(Err(e));
            unsafe { CoUninitialize() };
            return;
        }
    };
    // If the initialization caller timed out, never keep recording an
    // unclaimed endpoint. The normal Stop/drop path below still runs.
    let accepted = ready.send(Ok(())).is_ok();

    let mut resampler = Resampler::new(fmt.rate);
    let mut scratch: Vec<f32> = Vec::new();

    while accepted && !stop.load(Ordering::Acquire) {
        // WASAPI errors are not empty packets; failing selected audio must stop
        // the recording rather than silently filling the MP4 with zeros.
        let result = (|| -> Result<(), String> {
            let mut packet = unsafe { capture.GetNextPacketSize() }
                .map_err(|e| format!("GetNextPacketSize: {e}"))?;
            while packet > 0 && !stop.load(Ordering::Acquire) {
                let mut data: *mut u8 = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut flags = 0u32;
                unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }
                    .map_err(|e| format!("GetBuffer: {e}"))?;

                scratch.clear();
                let decoded = if let Err(error) = validate_packet_frames(frames, fmt.rate) {
                    Err(error)
                } else if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                    scratch.resize(frames as usize * CHANNELS, 0.0);
                    Ok(())
                } else if data.is_null() {
                    Err("Non-silent WASAPI packet has a null audio buffer".to_string())
                } else {
                    unsafe { to_stereo_f32(data, frames as usize, &fmt, &mut scratch) };
                    Ok(())
                };
                // A successful GetBuffer must always be paired with ReleaseBuffer,
                // even if its payload is malformed.
                unsafe { capture.ReleaseBuffer(frames) }
                    .map_err(|e| format!("ReleaseBuffer: {e}"))?;
                decoded?;

                let out = resampler.process(&scratch);
                let mut q = crate::state::lock(&queue.samples);
                q.extend(out.iter().copied());
                let over = q.len().saturating_sub(MAX_QUEUED_FRAMES * CHANNELS);
                if over > 0 {
                    q.drain(..over);
                }
                packet = unsafe { capture.GetNextPacketSize() }
                    .map_err(|e| format!("GetNextPacketSize: {e}"))?;
            }
            Ok(())
        })();
        if let Err(reason) = result {
            if !stop.load(Ordering::Acquire) {
                let error = format!("WASAPI {} capture failed: {reason}", kind.label());
                let mut status = crate::state::lock(&failure);
                if status.is_none() {
                    *status = Some(error.clone());
                }
                log(&error);
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }

    unsafe {
        let _ = client.Stop();
        drop(capture);
        drop(client);
        CoUninitialize();
    }
}

fn open(kind: Kind) -> Result<(IAudioClient, IAudioCaptureClient, SourceFormat), String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("MMDeviceEnumerator: {e}"))?;
        let flow = match kind {
            Kind::Microphone => eCapture,
            Kind::SystemLoopback => eRender,
        };
        let device = enumerator
            .GetDefaultAudioEndpoint(flow, eConsole)
            .map_err(|e| format!("nema zadanog uređaja: {e}"))?;
        let client: IAudioClient = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("IAudioClient: {e}"))?;

        let fmt_ptr = client
            .GetMixFormat()
            .map_err(|e| format!("GetMixFormat: {e}"))?;
        let fmt = match read_format(fmt_ptr) {
            Ok(fmt) => fmt,
            Err(error) => {
                // Windows allocates the mix format; invalid layouts must not leak it.
                CoTaskMemFree(Some(fmt_ptr as *const _));
                return Err(error);
            }
        };

        let flags = match kind {
            Kind::SystemLoopback => AUDCLNT_STREAMFLAGS_LOOPBACK,
            Kind::Microphone => 0,
        };
        // 200 ms buffera: dovoljno da 5 ms polling nikad ne izgubi paket.
        let init = client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 2_000_000, 0, fmt_ptr, None);
        CoTaskMemFree(Some(fmt_ptr as *const _));
        init.map_err(|e| format!("Initialize: {e}"))?;

        let capture: IAudioCaptureClient = client
            .GetService()
            .map_err(|e| format!("IAudioCaptureClient: {e}"))?;
        client.Start().map_err(|e| format!("Start: {e}"))?;

        log(&format!(
            "audio: {} otvoren — {} Hz, {} kan., {}",
            kind.label(),
            fmt.rate,
            fmt.channels,
            if fmt.float { "float" } else { "PCM" }
        ));
        Ok((client, capture, fmt))
    }
}

/// Convert the Windows WAVEFORMATEXTENSIBLE speaker layout to stereo weights.
/// The speaker order follows the increasing bit positions in dwChannelMask.
/// A bounded sum of channel weights prevents multichannel downmix clipping
/// while preserving centre-channel speech and surround channels.
fn downmix_weights(fmt: &SourceFormat) -> ([(f32, f32); 32], f32) {
    let mut weights = [(0.0f32, 0.0f32); 32];
    let mut mask = fmt.channel_mask;
    for (i, weight) in weights.iter_mut().enumerate().take(fmt.channels) {
        *weight = if mask != 0 {
            let bit = mask & mask.wrapping_neg();
            mask &= !bit;
            match bit {
                0x0001 | 0x0040 => (1.0, 0.0),   // front left, front left-of-center
                0x0002 | 0x0080 => (0.0, 1.0),   // front right, front right-of-center
                0x0004 => (0.707, 0.707),        // speech / front center
                0x0008 => (0.25, 0.25),          // low-frequency effects
                0x0010 | 0x0200 => (0.707, 0.0), // back/side left
                0x0020 | 0x0400 => (0.0, 0.707), // back/side right
                0x0100 => (0.5, 0.5),            // back center
                _ => (0.25, 0.25),               // height / unspecified speakers
            }
        } else {
            // Legacy multichannel PCM has no standard channel positions.
            // Include all channels rather than dropping the centre/surround.
            match i {
                0 => (1.0, 0.0),
                1 => (0.0, 1.0),
                2 => (0.707, 0.707),
                _ if i % 2 == 1 => (0.5, 0.0),
                _ => (0.0, 0.5),
            }
        };
    }
    let left: f32 = weights.iter().map(|v| v.0).sum();
    let right: f32 = weights.iter().map(|v| v.1).sum();
    (weights, left.max(right).max(1.0))
}

/// Pretvori sirovi WASAPI paket u interleaved stereo f32 (izvorni sample rate).
unsafe fn to_stereo_f32(data: *const u8, frames: usize, fmt: &SourceFormat, out: &mut Vec<f32>) {
    let ch = fmt.channels;
    let read = |i: usize| -> f32 {
        // i = indeks uzorka (frame * ch + kanal)
        match (fmt.float, fmt.bits) {
            // WASAPI supplies a byte pointer, not an alignment guarantee.
            // Read sample values without creating potentially unaligned references.
            (true, 32) => std::ptr::read_unaligned(data.add(i * 4).cast::<f32>()),
            (false, 16) => std::ptr::read_unaligned(data.add(i * 2).cast::<i16>()) as f32 / 32768.0,
            (false, 32) => {
                std::ptr::read_unaligned(data.add(i * 4).cast::<i32>()) as f32 / 2_147_483_648.0
            }
            (false, 24) => {
                let b = data.add(i * 3);
                let v =
                    ((*b.add(2) as i32) << 24 | (*b.add(1) as i32) << 16 | (*b as i32) << 8) >> 8;
                v as f32 / 8_388_608.0
            }
            (false, 8) => (*data.add(i) as f32 - 128.0) / 128.0,
            _ => 0.0,
        }
    };
    let (weights, normalization) = downmix_weights(fmt);
    out.reserve(frames * CHANNELS);
    for f in 0..frames {
        let base = f * ch;
        match ch {
            1 => {
                let m = read(base);
                out.push(m);
                out.push(m);
            }
            2 => {
                out.push(read(base));
                out.push(read(base + 1));
            }
            _ => {
                let (mut left, mut right) = (0.0f32, 0.0f32);
                for (c, &(wl, wr)) in weights.iter().enumerate().take(ch) {
                    let sample = read(base + c);
                    left += sample * wl;
                    right += sample * wr;
                }
                out.push(left / normalization);
                out.push(right / normalization);
            }
        }
    }
}

/// Linearni resampler stereo toka na 48 kHz. Za 48 kHz izvore je prolaz bez kopije.
struct Resampler {
    ratio: f64, // ulaznih frameova po izlaznom frameu
    pos: f64,   // pozicija u ulaznom toku (u frameovima), prenosi se između paketa
    tail: [f32; 2],
    has_tail: bool,
}

impl Resampler {
    fn new(src_rate: u32) -> Self {
        Self {
            ratio: src_rate as f64 / RATE as f64,
            pos: 0.0,
            tail: [0.0; 2],
            has_tail: false,
        }
    }

    fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if (self.ratio - 1.0).abs() < 1e-9 {
            return input.to_vec();
        }
        let in_frames = input.len() / CHANNELS;
        if in_frames == 0 {
            return Vec::new();
        }
        // Zalijepi zadnji frame prošlog paketa ispred ovog da interpolacija nema šav.
        let mut buf: Vec<f32> = Vec::with_capacity(input.len() + 2);
        if self.has_tail {
            buf.extend_from_slice(&self.tail);
        }
        buf.extend_from_slice(input);
        let frames = buf.len() / CHANNELS;

        let mut out = Vec::with_capacity((frames as f64 / self.ratio) as usize * CHANNELS + 2);
        while self.pos + 1.0 < frames as f64 {
            let i = self.pos as usize;
            let t = (self.pos - i as f64) as f32;
            for c in 0..CHANNELS {
                let a = buf[i * CHANNELS + c];
                let b = buf[(i + 1) * CHANNELS + c];
                out.push(a + (b - a) * t);
            }
            self.pos += self.ratio;
        }
        // Zadrži zadnji frame kao rep za sljedeći paket i pomakni poziciju.
        let last = frames - 1;
        self.tail = [buf[last * CHANNELS], buf[last * CHANNELS + 1]];
        self.has_tail = true;
        self.pos -= last as f64;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_48k_je_prolaz() {
        let mut r = Resampler::new(48_000);
        let input: Vec<f32> = (0..20).map(|i| i as f32).collect();
        assert_eq!(r.process(&input), input);
    }

    #[test]
    fn resampler_96k_prepolovi_i_zadrzi_kontinuitet() {
        let mut r = Resampler::new(96_000);
        // 2 paketa po 100 stereo frameova rampe → izlaz ~100 frameova ukupno, monotono rastuć.
        let mk = |start: usize| -> Vec<f32> {
            (0..100)
                .flat_map(|f| [(start + f) as f32, -((start + f) as f32)])
                .collect()
        };
        let a = r.process(&mk(0));
        let b = r.process(&mk(100));
        let total = (a.len() + b.len()) / CHANNELS;
        assert!((95..=101).contains(&total), "izlaz {total} frameova");
        let left: Vec<f32> = a.iter().chain(b.iter()).step_by(2).copied().collect();
        assert!(left.windows(2).all(|w| w[1] > w[0]), "šav između paketa");
    }

    #[test]
    fn mixer_bez_izvora_daje_tisinu() {
        let m = Mixer {
            queues: vec![],
            stop: Arc::new(AtomicBool::new(false)),
            threads: vec![],
            failure: Arc::new(Mutex::new(None)),
            kinds: vec![],
            gains: [1.0; 2],
        };
        let out = m.pull(10);
        assert_eq!(out.len(), 20);
        assert!(out.iter().all(|&s| s == 0));
    }

    #[test]
    fn runtime_source_failure_is_reported_without_silent_fallback() {
        let failure = Arc::new(Mutex::new(None));
        let mixer = Mixer {
            queues: vec![],
            stop: Arc::new(AtomicBool::new(false)),
            threads: vec![],
            failure: Arc::clone(&failure),
            kinds: vec![],
            gains: [1.0; 2],
        };
        assert!(mixer.check_health().is_ok());
        *crate::state::lock(&failure) =
            Some("WASAPI microphone capture failed: simulated invalidation".into());
        let error = mixer
            .check_health()
            .expect_err("failed audio must not be silent");
        assert!(error.contains("invalidation"));
    }

    #[test]
    fn rejects_unbounded_wasapi_packet_frame_counts() {
        assert!(validate_packet_frames(0, RATE).is_ok());
        assert!(validate_packet_frames(RATE * 2, RATE).is_ok());
        assert!(validate_packet_frames(RATE * 2 + 1, RATE).is_err());
        assert!(validate_packet_frames(u32::MAX, RATE).is_err());
        assert!(validate_packet_frames(1, 0).is_err());
    }

    #[test]
    fn pcm16_and_float32_accept_misaligned_wasapi_byte_pointers() {
        let pcm = SourceFormat {
            rate: RATE,
            channels: 2,
            float: false,
            bits: 16,
            channel_mask: 0,
        };
        let mut pcm_bytes = [0u8; 5];
        pcm_bytes[1..3].copy_from_slice(&16_384i16.to_le_bytes());
        pcm_bytes[3..5].copy_from_slice(&(-16_384i16).to_le_bytes());
        let mut pcm_out = Vec::new();
        unsafe {
            to_stereo_f32(pcm_bytes.as_ptr().add(1), 1, &pcm, &mut pcm_out);
        }
        assert_eq!(pcm_out, vec![0.5, -0.5]);

        let float = SourceFormat {
            rate: RATE,
            channels: 2,
            float: true,
            bits: 32,
            channel_mask: 0,
        };
        let mut float_bytes = [0u8; 9];
        float_bytes[1..5].copy_from_slice(&0.25f32.to_le_bytes());
        float_bytes[5..9].copy_from_slice(&(-0.75f32).to_le_bytes());
        let mut float_out = Vec::new();
        unsafe {
            to_stereo_f32(float_bytes.as_ptr().add(1), 1, &float, &mut float_out);
        }
        assert_eq!(float_out, vec![0.25, -0.75]);
    }

    #[test]
    fn multichannel_51_preserves_speech_and_surround_direction() {
        // Windows 5.1 order: FL FR FC LFE BL BR.
        let fmt = SourceFormat {
            rate: RATE,
            channels: 6,
            float: true,
            bits: 32,
            channel_mask: 0x3f,
        };
        let decode = |samples: [f32; 6]| -> Vec<f32> {
            let data: Vec<u8> = samples.iter().flat_map(|v| v.to_le_bytes()).collect();
            let mut output = Vec::new();
            unsafe { to_stereo_f32(data.as_ptr(), 1, &fmt, &mut output) };
            output
        };
        let centre = decode([0.0, 0.0, 0.9, 0.0, 0.0, 0.0]);
        assert!(centre[0] > 0.0);
        assert_eq!(
            centre[0], centre[1],
            "centre speech must reach both speakers"
        );
        let surround = decode([0.0, 0.0, 0.0, 0.0, 0.8, 0.0]);
        assert!(surround[0] > 0.0);
        assert_eq!(surround[1], 0.0, "left rear must not leak right");
        let loud = decode([1.0; 6]);
        assert!(loud.iter().all(|v| *v <= 1.0), "avoid downmix clipping");
    }

    #[test]
    fn multichannel_71_side_surround_is_preserved() {
        // 7.1 order: FL FR FC LFE BL BR SL SR.
        let fmt = SourceFormat {
            rate: RATE,
            channels: 8,
            float: true,
            bits: 32,
            channel_mask: 0x63f,
        };
        let mut samples = [0.0f32; 8];
        samples[7] = 0.8;
        let data: Vec<u8> = samples.iter().flat_map(|v| v.to_le_bytes()).collect();
        let mut out = Vec::new();
        unsafe { to_stereo_f32(data.as_ptr(), 1, &fmt, &mut out) };
        assert_eq!(out[0], 0.0);
        assert!(out[1] > 0.0, "side right must reach right speaker");
    }

    #[test]
    fn independent_gains_are_applied_before_mix_and_clipping() {
        let mic = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![0.25, 0.25, 1.0, -1.0])),
        });
        let system = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![0.5, -0.5, 0.75, -0.75])),
        });
        let mixer = Mixer {
            queues: vec![system, mic],
            stop: Arc::new(AtomicBool::new(false)),
            threads: vec![],
            failure: Arc::new(Mutex::new(None)),
            kinds: vec![Kind::SystemLoopback, Kind::Microphone],
            gains: [gain_from_percent(Some(200)), gain_from_percent(Some(0))],
        };
        assert_eq!(mixer.pull(2), vec![16383, 16383, i16::MAX, -i16::MAX]);
        assert_eq!(gain_from_percent(Some(201)), 1.0);
        assert_eq!(gain_from_percent(None), 1.0);
    }

    #[test]
    fn mixer_rejects_nonfinite_samples_without_poisoning_other_sources() {
        let q1 = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![f32::NAN, f32::INFINITY])),
        });
        let q2 = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![0.5, -0.5])),
        });
        let mixer = Mixer {
            queues: vec![q1, q2],
            stop: Arc::new(AtomicBool::new(false)),
            threads: vec![],
            failure: Arc::new(Mutex::new(None)),
            kinds: vec![],
            gains: [1.0; 2],
        };
        assert_eq!(mixer.pull(1), vec![16383, -16383]);
    }

    #[test]
    fn mixer_zbraja_izvore_i_klipa() {
        let q1 = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![0.5f32; 4])),
        });
        let q2 = Arc::new(Queue {
            samples: Mutex::new(VecDeque::from(vec![0.75f32; 2])),
        });
        let m = Mixer {
            queues: vec![q1, q2],
            stop: Arc::new(AtomicBool::new(false)),
            threads: vec![],
            failure: Arc::new(Mutex::new(None)),
            kinds: vec![],
            gains: [1.0; 2],
        };
        let out = m.pull(2);
        // prva dva uzorka: 0.5+0.75 = 1.25 → klip na 1.0; druga dva: samo 0.5 (q2 prazan)
        assert_eq!(out[0], i16::MAX);
        assert_eq!(out[1], i16::MAX);
        assert_eq!(out[2], (0.5 * i16::MAX as f32) as i16);
        assert_eq!(out[3], (0.5 * i16::MAX as f32) as i16);
    }
}
