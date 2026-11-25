// Snapvere by Brendigo
//! Snimanje ekrana — hvatanje frameova, enkodiranje i spremanje u galeriju.
//!
//! Sve se odvija na JEDNOJ radnoj dretvi ("snapvere-recorder"): D3D uređaj i Media
//! Foundation sink writer vezani su uz dretvu koja ih je stvorila, a jedna dretva
//! ujedno znači da nema kanala ni zaključavanja po frameu.
//!
//! Glavna dretva vidi samo atomike u `Ctl` (faza, brojači) i dvije zastavice
//! (stop/cancel), pa UI nikad ne čeka enkoder.

#[cfg(windows)]
mod audio;
#[cfg(windows)]
mod cursor;
#[cfg(windows)]
mod dxgi;
#[cfg(windows)]
mod mp4;

#[cfg(all(target_os = "linux", feature = "linux-native-media"))]
mod audio_clock;
mod gifenc;
#[cfg(all(target_os = "linux", feature = "linux-native-media"))]
pub(crate) mod linux_audio;
#[cfg(all(target_os = "linux", feature = "linux-native-media"))]
mod linux_mp4;
mod pixels;
pub(crate) mod preview;
mod transport;
#[cfg(all(target_os = "linux", feature = "linux-native-media"))]
pub(crate) mod wayland;
#[cfg(all(target_os = "linux", feature = "linux-native-media"))]
mod wayland_outputs;
mod worker;

pub use pixels::crop_rect;
use transport::Encoder;
use worker::run;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::logging::log;
use crate::models::{
    CaptureSource, PixelRect, RecordFormat, RecordOptions, RecordPhase, RecordStatus, Region,
    Screenshot,
};
use crate::state::AppState;

const PHASE_IDLE: u8 = 0;
const PHASE_RECORDING: u8 = 1;
const PHASE_PAUSED: u8 = 2;
const PHASE_FINISHING: u8 = 3;

// A recorder takes time to initialize its native encoder. Until its session
// enters state.recorder, the ordinary is_active() guard cannot observe it.
static RECORDER_STARTING: AtomicBool = AtomicBool::new(false);

struct RecorderStartGuard;

impl RecorderStartGuard {
    fn acquire() -> Result<Self, String> {
        RECORDER_STARTING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Recorder is already starting".to_string())?;
        Ok(Self)
    }
}

impl Drop for RecorderStartGuard {
    fn drop(&mut self) {
        RECORDER_STARTING.store(false, Ordering::Release);
    }
}

/// Što snimamo: monitor u fizičkim koordinatama + opcionalna regija unutar njega.
#[derive(Debug, Clone, Copy)]
pub struct RecordTarget {
    pub monitor_id: u32,
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub monitor_w: u32,
    pub monitor_h: u32,
    pub region: Option<Region>,
}

/// Dijeljeno stanje između UI dretve i snimatelja. Samo atomici — bez zaključavanja.
pub struct Ctl {
    phase: AtomicU8,
    stop: AtomicBool,
    cancel: AtomicBool,
    elapsed_ms: AtomicU64,
    frames: AtomicU64,
    size_bytes: AtomicU64,
    width: u32,
    height: u32,
    format: RecordFormat,
    /// Područja koja se pikseliziraju u svakom frameu (koordinate snimke).
    /// Jedini ne-atomik ovdje; lock je nenapadnut i drži se mikrosekundu po frameu.
    blur: Mutex<Vec<PixelRect>>,
    preview: Option<Mutex<preview::Preview>>,
    pause_ack: AtomicBool,
    /// Trenutak pokretanja — hotkey ne smije zaustaviti tek pokrenuto snimanje.
    started: Instant,
    /// Što se od zvuka STVARNO snima (postavlja recorder nakon otvaranja izvora).
    mic: AtomicBool,
    system_audio: AtomicBool,
    /// Set only when this session has successfully opened its own output file.
    output_owned: AtomicBool,
}

impl Ctl {
    fn status(&self) -> RecordStatus {
        RecordStatus {
            phase: match self.phase.load(Ordering::Relaxed) {
                PHASE_RECORDING => RecordPhase::Recording,
                PHASE_PAUSED => RecordPhase::Paused,
                PHASE_FINISHING => RecordPhase::Finishing,
                _ => RecordPhase::Idle,
            },
            elapsed_ms: self.elapsed_ms.load(Ordering::Relaxed),
            frames: self.frames.load(Ordering::Relaxed),
            format: self.format,
            width: self.width,
            height: self.height,
            size_bytes: self.size_bytes.load(Ordering::Relaxed),
            mic: self.mic.load(Ordering::Relaxed),
            system_audio: self.system_audio.load(Ordering::Relaxed),
        }
    }
}

pub struct Session {
    pub ctl: Arc<Ctl>,
}

// ────────────────────────────── javno API ──────────────────────────────

/// Zagrij D3D11/DXGI i Media Foundation na pozadinskoj dretvi pri startu.
///
/// Prvi `D3D11CreateDevice` u procesu učitava driver DLL-ove i traje 300-500 ms —
/// bez ovoga bi svako PRVO snimanje kasnilo pola sekunde prije nego HUD išta pokaže.
/// Otvorena duplikacija se odmah pušta; ne držimo ništa trajno.
pub fn warm_up() {
    // Linux already uses xcap; there is no DXGI or Media Foundation to warm up.
    #[cfg(windows)]
    let _ = std::thread::Builder::new()
        .name("snapvere-warmup".into())
        .spawn(|| {
            let t = Instant::now();
            #[cfg(windows)]
            {
                if let Ok(monitors) = xcap::Monitor::all() {
                    let primary = monitors
                        .iter()
                        .find(|m| m.is_primary().unwrap_or(false))
                        .or_else(|| monitors.first());
                    if let Some(m) = primary {
                        let (x, y) = (m.x().unwrap_or(0), m.y().unwrap_or(0));
                        drop(dxgi::DxgiGrabber::new(x, y));
                    }
                }
                drop(mp4::MfSession::start());
            }
            log(&format!("zagrijavanje D3D/MF gotovo za {:?}", t.elapsed()));
        });
}

/// Recorder initialization is also a live operation until the native encoder starts.
pub fn is_starting() -> bool {
    RECORDER_STARTING.load(Ordering::Acquire)
}

/// Je li snimanje u tijeku (ili na pauzi).
pub fn is_active(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let guard = crate::state::lock(&state.recorder);
    guard
        .as_ref()
        .map(|s| s.ctl.phase.load(Ordering::Relaxed) != PHASE_IDLE)
        .unwrap_or(false)
}

/// Block a deliberate application shutdown until the recorder has finalized the
/// media file and registered it in the local gallery. Bounded to avoid hanging
/// forever on a driver deadlock; never hold a database or recorder lock while
/// waiting because the worker must acquire those to complete.
pub fn wait_for_finalize(app: &AppHandle, timeout: Duration) -> bool {
    let start = Instant::now();
    while is_active(app) {
        if start.elapsed() >= timeout {
            log("Recorder did not finalize before shutdown timeout; data may be incomplete");
            return false;
        }
        std::thread::sleep(Duration::from_millis(40));
    }
    true
}

/// Koliko dugo aktivno snimanje traje (None kad se ne snima).
pub fn age(app: &AppHandle) -> Option<Duration> {
    let state = app.state::<AppState>();
    let guard = crate::state::lock(&state.recorder);
    guard
        .as_ref()
        .filter(|s| s.ctl.phase.load(Ordering::Relaxed) != PHASE_IDLE)
        .map(|s| s.ctl.started.elapsed())
}

pub fn status(app: &AppHandle) -> RecordStatus {
    let state = app.state::<AppState>();
    let guard = crate::state::lock(&state.recorder);
    guard
        .as_ref()
        .map(|s| s.ctl.status())
        .unwrap_or_else(RecordStatus::idle)
}

/// GIF cannot contain audio: reject incompatible options instead of silently
/// returning an audio-less recording that was requested with audio enabled.
fn validate_audio_options(opts: &RecordOptions) -> Result<(), String> {
    if matches!(opts.format, RecordFormat::Gif) && (opts.mic || opts.system_audio) {
        return Err(
            "GIF cannot contain audio. Choose MP4 or disable microphone and system audio.".into(),
        );
    }
    Ok(())
}

#[cfg(windows)]
fn ensure_audio_sources(requested: &[audio::Kind], opened: &[audio::Kind]) -> Result<(), String> {
    if let Some(missing) = requested.iter().find(|kind| !opened.contains(kind)) {
        return Err(format!(
            "Requested {missing:?} audio is unavailable. Recording was not started."
        ));
    }
    Ok(())
}

/// Pokreni snimanje. Vraća početni status (dimenzije, format) ili grešku ako
/// se izvor/enkoder nije dao otvoriti — greška stiže PRIJE nego HUD ode gore.
pub fn start(
    app: &AppHandle,
    target: RecordTarget,
    opts: RecordOptions,
    #[cfg(all(target_os = "linux", feature = "linux-native-media"))] portal: Option<
        wayland::OutputGeometry,
    >,
) -> Result<RecordStatus, String> {
    let _starting = RecorderStartGuard::acquire()?;
    if is_active(app) {
        return Err("Snimanje je već u tijeku".into());
    }
    validate_audio_options(&opts)?;
    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    if opts.format == RecordFormat::Mp4 && opts.capture_cursor {
        return Err("Experimental Linux MP4 requires cursor capture to be disabled".into());
    }

    let fps = opts.fps.clamp(5, 60);
    // Izlazne dimenzije moraju biti parne (NV12 uzorkuje kromu 2x2).
    let (ox, oy, ow, oh) = crop_rect(&target)?;

    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    let portal_preview = portal.is_some();
    #[cfg(not(all(target_os = "linux", feature = "linux-native-media")))]
    let portal_preview = false;
    let preview = portal_preview.then(|| Mutex::new(preview::Preview::new(ow, oh)));

    let ctl = Arc::new(Ctl {
        phase: AtomicU8::new(PHASE_RECORDING),
        stop: AtomicBool::new(false),
        cancel: AtomicBool::new(false),
        elapsed_ms: AtomicU64::new(0),
        frames: AtomicU64::new(0),
        size_bytes: AtomicU64::new(0),
        width: ow,
        height: oh,
        format: opts.format,
        blur: Mutex::new(Vec::new()),
        preview,
        pause_ack: AtomicBool::new(false),
        started: Instant::now(),
        mic: AtomicBool::new(false),
        system_audio: AtomicBool::new(false),
        output_owned: AtomicBool::new(false),
    });

    let out_path = output_path(app, opts.format)?;

    // Handshake: enkoder i grabber se otvaraju NA radnoj dretvi (D3D/MF su thread-affine),
    // pa grešku otvaranja moramo dočekati ovdje da je korisnik vidi odmah.
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

    let thread_ctl = ctl.clone();
    let thread_app = app.clone();
    let thread_path = out_path.clone();
    // Dropping JoinHandle detaches the recording worker; session cleanup is
    // asynchronous via finish_session(), never a blocking join on the UI thread.
    let _worker = std::thread::Builder::new()
        .name("snapvere-recorder".into())
        .spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run(
                    &thread_app,
                    &thread_ctl,
                    &thread_path,
                    target,
                    opts,
                    fps,
                    (ox, oy, ow, oh),
                    ready_tx.clone(),
                    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
                    portal,
                )
            }));
            let outcome = match result {
                Ok(r) => r,
                Err(_) => Err("snimanje: interna greška (panic uhvaćen)".to_string()),
            };
            // Propagate startup failures and panic before the UI displays recording HUD.
            report_start_failure(&ready_tx, &outcome);
            finish_session(&thread_app, &thread_ctl, &thread_path, outcome);
        })
        .map_err(|e| format!("ne mogu pokrenuti dretvu snimanja: {e}"))?;

    // Otvaranje DXGI-ja + MF-a je ispod ~300 ms; timeout je samo zaštita od zaglavljivanja.
    #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
    let startup_timeout = if wayland::active() { 100 } else { 10 };
    #[cfg(not(all(target_os = "linux", feature = "linux-native-media")))]
    let startup_timeout = 10;
    match ready_rx.recv_timeout(Duration::from_secs(startup_timeout)) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            ctl.phase.store(PHASE_IDLE, Ordering::SeqCst);
            return Err(e);
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            ctl.cancel.store(true, Ordering::SeqCst);
            return Err("snimanje se nije pokrenulo na vrijeme".into());
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            ctl.cancel.store(true, Ordering::SeqCst);
            return Err("dretva snimanja završila je bez potvrde inicijalizacije".into());
        }
    }

    let state = app.state::<AppState>();
    {
        let mut slot = crate::state::lock(&state.recorder);
        // The worker can fail and finalize immediately after its ready
        // handshake. Check under the same lock used by finish_session so
        // a completed session is never reinserted as a stale live recording.
        if ctl.phase.load(Ordering::SeqCst) == PHASE_IDLE {
            return Err("Recorder finished during initialization".into());
        }
        *slot = Some(Session { ctl: ctl.clone() });
    }
    crate::tray::set_recording(app, true);
    let st = ctl.status();
    let _ = app.emit("snapvere:rec-state", &st);
    Ok(st)
}

/// Zaustavi snimanje i spremi datoteku. Vraća odmah — enkoder zatvara datoteku u
/// pozadini i javlja se preko `snapvere:rec-done`.
pub fn stop(app: &AppHandle) -> Result<(), String> {
    with_ctl(app, |ctl| {
        ctl.stop.store(true, Ordering::SeqCst);
        ctl.phase.store(PHASE_FINISHING, Ordering::SeqCst);
    })?;
    publish_phase(app);
    Ok(())
}

/// Prekini snimanje i baci datoteku.
pub fn cancel(app: &AppHandle) -> Result<(), String> {
    with_ctl(app, |ctl| {
        ctl.cancel.store(true, Ordering::SeqCst);
        ctl.stop.store(true, Ordering::SeqCst);
        ctl.phase.store(PHASE_FINISHING, Ordering::SeqCst);
    })?;
    publish_phase(app);
    Ok(())
}

/// Zamijeni skup redact pravokutnika. Prazan popis = ništa se ne pikselizira.
const MAX_BLUR_REGIONS: usize = 32;

/// Bound redact work per video frame and clamp hostile/overflowing rectangles
/// to physical recording dimensions before passing them to the pixel loop.
fn bounded_blur_rects(
    rects: &[PixelRect],
    width: u32,
    height: u32,
) -> Result<Vec<PixelRect>, String> {
    if rects.len() > MAX_BLUR_REGIONS {
        return Err(format!(
            "Too many redact areas (maximum {MAX_BLUR_REGIONS})"
        ));
    }
    Ok(rects
        .iter()
        .filter_map(|rect| {
            let x = rect.x.min(width);
            let y = rect.y.min(height);
            let w = rect.width.min(width.saturating_sub(x));
            let h = rect.height.min(height.saturating_sub(y));
            (w > 0 && h > 0).then_some(PixelRect {
                x,
                y,
                width: w,
                height: h,
            })
        })
        .collect())
}

pub fn set_blur_regions(
    app: &AppHandle,
    rects: Vec<PixelRect>,
    viewport: (u32, u32),
    surface: (u32, u32),
    scale: f64,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let guard = crate::state::lock(&state.recorder);
    let Some(session) = guard.as_ref() else {
        return Err("nema aktivnog snimanja".into());
    };
    let ctl = &session.ctl;
    if surface != (ctl.width, ctl.height) {
        return Err("Redaction window does not match the recording dimensions".into());
    }
    let mapped = pixels::map_redaction_rects(&rects, viewport, surface, scale)?;
    let bounded = bounded_blur_rects(&mapped, ctl.width, ctl.height)?;
    *crate::state::lock(&ctl.blur) = bounded;
    Ok(())
}

// Preview windows are shown only after the worker acknowledges its pause.
// Resume hides the window first. The main-thread show path uses try_lock so
// it never deadlocks with a concurrent IPC resume waiting for the UI thread.
fn hide_preview(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("recpreview") {
        window.hide().map_err(|e| e.to_string())?;
        if window.is_visible().map_err(|e| e.to_string())? {
            return Err("Close the recording preview before resuming".into());
        }
    }
    Ok(())
}

pub(super) fn offer_preview(app: &AppHandle, ctl: &Arc<Ctl>) {
    let app = app.clone();
    let ctl = ctl.clone();
    let dispatch = app.clone();
    let _ = dispatch.run_on_main_thread(move || {
        let state = app.state::<AppState>();
        let Ok(slot) = state.recorder.try_lock() else {
            return;
        };
        if !slot.as_ref().is_some_and(|s| Arc::ptr_eq(&s.ctl, &ctl))
            || ctl.phase.load(Ordering::Acquire) != PHASE_PAUSED
            || !ctl.pause_ack.load(Ordering::Acquire)
            || !ctl
                .preview
                .as_ref()
                .is_some_and(|p| crate::state::lock(p).ready())
        {
            return;
        }
        if let Err(error) = crate::commands::show_crop_preview(&app) {
            log(&format!("Recording preview unavailable: {error}"));
        }
    });
}

pub fn crop_preview(app: &AppHandle) -> Result<preview::Snapshot, String> {
    let state = app.state::<AppState>();
    let slot = crate::state::lock(&state.recorder);
    let ctl = &slot.as_ref().ok_or("No active recording")?.ctl;
    if ctl.phase.load(Ordering::Acquire) != PHASE_PAUSED || !ctl.pause_ack.load(Ordering::Acquire) {
        return Err("Recording preview requires an acknowledged pause".into());
    }
    let preview = ctl
        .preview
        .as_ref()
        .ok_or("Recording preview is unavailable")?;
    let preview = crate::state::lock(preview);
    preview.snapshot()
}

pub fn crop_preview_packet(app: &AppHandle, session: &str, after: u64) -> Result<Vec<u8>, String> {
    let state = app.state::<AppState>();
    let slot = crate::state::lock(&state.recorder);
    let ctl = &slot.as_ref().ok_or("No active recording")?.ctl;
    if ctl.phase.load(Ordering::Acquire) != PHASE_PAUSED || !ctl.pause_ack.load(Ordering::Acquire) {
        return Err("Recording preview requires an acknowledged pause".into());
    }
    let preview = ctl
        .preview
        .as_ref()
        .ok_or("Recording preview is unavailable")?;
    let mut preview = crate::state::lock(preview);
    preview.check_session(session)?;
    preview.packet(after)
}

pub fn acknowledge_crop_preview(
    app: &AppHandle,
    session: &str,
    frame_id: u64,
) -> Result<u64, String> {
    let state = app.state::<AppState>();
    let slot = crate::state::lock(&state.recorder);
    let ctl = &slot.as_ref().ok_or("No active recording")?.ctl;
    if ctl.phase.load(Ordering::Acquire) != PHASE_PAUSED || !ctl.pause_ack.load(Ordering::Acquire) {
        return Err("Recording preview requires an acknowledged pause".into());
    }
    let preview = ctl
        .preview
        .as_ref()
        .ok_or("Recording preview is unavailable")?;
    let receipt = crate::state::lock(preview).acknowledge(session, frame_id)?;
    log(&format!(
        "Paused preview receipt: total={} us, sample-to-packet={} us, packet-to-receipt={} us (includes IPC and pause; not physical presentation)",
        receipt.total_us, receipt.sample_to_packet_us, receipt.packet_to_receipt_us
    ));
    Ok(receipt.total_us)
}

pub fn resume_crop_preview(
    app: &AppHandle,
    session: &str,
    marks: Vec<preview::Mark>,
    history_delta: i32,
) -> Result<RecordStatus, String> {
    {
        let state = app.state::<AppState>();
        let slot = crate::state::lock(&state.recorder);
        let ctl = &slot.as_ref().ok_or("No active recording")?.ctl;
        if ctl.phase.load(Ordering::Acquire) != PHASE_PAUSED
            || !ctl.pause_ack.load(Ordering::Acquire)
        {
            return Err("Recording is not paused".into());
        }
        let preview = ctl
            .preview
            .as_ref()
            .ok_or("Recording preview is unavailable")?;
        let mut preview = crate::state::lock(preview);
        preview.check_session(session)?;
        let plan = preview.plan(&marks, history_delta)?;
        hide_preview(app)?;
        preview.apply(plan);
        ctl.pause_ack.store(false, Ordering::Release);
        ctl.phase.store(PHASE_RECORDING, Ordering::Release);
    }
    Ok(publish_phase(app))
}

pub fn set_paused(app: &AppHandle, paused: bool) -> Result<RecordStatus, String> {
    {
        let state = app.state::<AppState>();
        let slot = crate::state::lock(&state.recorder);
        let ctl = &slot.as_ref().ok_or("No active recording")?.ctl;
        let current = ctl.phase.load(Ordering::SeqCst);
        if paused && current == PHASE_RECORDING {
            ctl.pause_ack.store(false, Ordering::Release);
            ctl.phase.store(PHASE_PAUSED, Ordering::SeqCst);
        } else if !paused && current == PHASE_PAUSED {
            if ctl.preview.is_some() {
                hide_preview(app)?;
            }
            ctl.pause_ack.store(false, Ordering::Release);
            ctl.phase.store(PHASE_RECORDING, Ordering::SeqCst);
        }
    }
    Ok(publish_phase(app))
}

fn publish_phase(app: &AppHandle) -> RecordStatus {
    let st = status(app);
    crate::tray::set_phase(app, st.phase);
    let _ = app.emit("snapvere:rec-state", &st);
    st
}

fn with_ctl(app: &AppHandle, f: impl FnOnce(&Ctl)) -> Result<(), String> {
    let state = app.state::<AppState>();
    let guard = crate::state::lock(&state.recorder);
    let Some(session) = guard.as_ref() else {
        return Err("nema aktivnog snimanja".into());
    };
    f(&session.ctl);
    Ok(())
}

// ───────────────────────────── radna dretva ─────────────────────────────

/// Report startup failures to the waiting caller; after READY the receiver is gone.
fn report_start_failure<T>(
    ready: &std::sync::mpsc::Sender<Result<(), String>>,
    outcome: &Result<T, String>,
) {
    if let Err(error) = outcome {
        let _ = ready.send(Err(error.clone()));
    }
}

/// A successful container finalization never masks a frame/audio capture failure.
fn recording_completion(
    recording_error: Option<String>,
    finalize_result: Result<(), String>,
) -> Result<(), String> {
    match (recording_error, finalize_result) {
        (Some(recording), Err(finalize)) => Err(format!(
            "{recording}; završavanje snimke također nije uspjelo: {finalize}"
        )),
        (Some(recording), Ok(())) => Err(recording),
        (None, Err(finalize)) => Err(format!(
            "snimanje: završavanje datoteke nije uspjelo — {finalize}"
        )),
        (None, Ok(())) => Ok(()),
    }
}

/// Rezultat snimanja koji ide u `finish_session`.
struct Recorded {
    cancelled: bool,
    width: u32,
    height: u32,
    /// Prvi frame (RGBA) — izvor za thumbnail u galeriji.
    thumb: Option<image::RgbaImage>,
}

/// WASAPI's mixer only retains 2 seconds of audio. A larger catch-up
/// interval is unrecoverable: do not manufacture a long silent recording.
#[cfg(windows)]
fn validate_audio_backlog(written: i64, due: i64) -> Result<i64, String> {
    let backlog = due
        .checked_sub(written)
        .ok_or_else(|| "Audio timeline overflow".to_string())?;
    if backlog > audio::MAX_QUEUED_FRAMES as i64 {
        return Err(format!(
            "Audio backlog exceeded the 2-second WASAPI buffer ({backlog} frames)"
        ));
    }
    Ok(backlog.max(0))
}

/// Pull and encode bounded 500-ms PCM chunks instead of allocating the full
/// audio backlog in one contiguous buffer after scheduler or system stalls.
#[cfg(windows)]
fn write_audio_until(
    encoder: &mut Encoder,
    mixer: &audio::Mixer,
    written: &mut i64,
    due: i64,
) -> Result<(), String> {
    let outstanding = validate_audio_backlog(*written, due)?;
    if outstanding == 0 {
        return Ok(());
    }
    const CHUNK: i64 = audio::RATE as i64 / 2;
    while *written < due {
        mixer.check_health()?;
        let frames = (due - *written).min(CHUNK);
        let pcm = mixer.pull(frames as usize);
        let timestamp = written
            .checked_mul(10_000_000)
            .ok_or_else(|| "Audio timestamp overflow".to_string())?
            / audio::RATE as i64;
        let duration = frames * 10_000_000 / audio::RATE as i64;
        encoder.write_audio(&pcm, timestamp, duration)?;
        *written += frames;
    }
    Ok(())
}

fn open_encoder(
    path: &Path,
    format: RecordFormat,
    w: u32,
    h: u32,
    fps: u32,
    quality: u8,
    with_audio: bool,
) -> Result<Encoder, String> {
    #[cfg(not(any(windows, all(target_os = "linux", feature = "linux-native-media"))))]
    let _ = with_audio;
    match format {
        #[cfg(windows)]
        RecordFormat::Mp4 => Ok(Encoder::Mp4(Box::new(mp4::Mp4Encoder::new(
            path,
            w,
            h,
            fps,
            quality,
            with_audio.then_some(mp4::AudioSpec {
                sample_rate: audio::RATE,
                channels: audio::CHANNELS as u32,
            }),
        )?))),
        #[cfg(all(target_os = "linux", feature = "linux-native-media"))]
        RecordFormat::Mp4 => Ok(Encoder::LinuxMp4(Box::new(linux_mp4::LinuxMp4::new(
            path, w, h, fps, quality, with_audio,
        )?))),
        #[cfg(not(any(windows, all(target_os = "linux", feature = "linux-native-media"))))]
        RecordFormat::Mp4 => Err("MP4 recording is not available in this build".into()),
        RecordFormat::Gif => Ok(Encoder::Gif(Box::new(gifenc::GifEncoder::new(
            path, w, h, fps, quality,
        )?))),
    }
}

// A failed exclusive encoder open must never delete a different recording
// already present at the output path. Cleanup is limited to this session's file.
fn remove_owned_recording(path: &Path, owned: bool) {
    if owned {
        let _ = std::fs::remove_file(path);
    }
}

/// Zatvori sesiju: spremi u galeriju ili obriši datoteku, javi frontendu, očisti slot.
fn finish_session(
    app: &AppHandle,
    ctl: &Arc<Ctl>,
    path: &PathBuf,
    outcome: Result<Recorded, String>,
) {
    #[derive(serde::Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct Done {
        screenshot: Option<Screenshot>,
        error: Option<String>,
        cancelled: bool,
    }

    let owned = ctl.output_owned.load(Ordering::Acquire);
    let payload = match outcome {
        Err(e) => {
            remove_owned_recording(path, owned);
            log(&format!("snimanje neuspješno: {e}"));
            Done {
                screenshot: None,
                error: Some(e),
                cancelled: false,
            }
        }
        Ok(rec) if rec.cancelled => {
            remove_owned_recording(path, owned);
            log("snimanje otkazano, datoteka obrisana");
            Done {
                screenshot: None,
                error: None,
                cancelled: true,
            }
        }
        Ok(rec) => {
            let frames = ctl.frames.load(Ordering::Relaxed);
            if frames == 0 {
                remove_owned_recording(path, owned);
                Done {
                    screenshot: None,
                    error: Some("Snimka nema nijedan frame".into()),
                    cancelled: false,
                }
            } else {
                match crate::commands::register_media(
                    app,
                    path,
                    rec.width,
                    rec.height,
                    CaptureSource::Recording,
                    ctl.format.ext(),
                    rec.thumb.as_ref(),
                ) {
                    Ok(shot) => {
                        log(&format!(
                            "snimka spremljena: {} ({frames} frameova, {} KB)",
                            shot.name,
                            shot.size_bytes / 1024
                        ));
                        Done {
                            screenshot: Some(shot),
                            error: None,
                            cancelled: false,
                        }
                    }
                    Err(e) => Done {
                        screenshot: None,
                        error: Some(e),
                        cancelled: false,
                    },
                }
            }
        }
    };

    ctl.size_bytes.store(
        std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
        Ordering::Relaxed,
    );

    if ctl.preview.is_some() {
        let _ = hide_preview(app);
    }

    // Send terminal notifications before making the recorder available again.
    // Otherwise a new session can start while this worker is still emitting
    // old "idle" events and resetting its tray UI.
    crate::tray::set_recording(app, false);
    let _ = app.emit("snapvere:rec-state", RecordStatus::idle());
    let _ = app.emit("snapvere:rec-done", payload);

    let state = app.state::<AppState>();
    let mut slot = crate::state::lock(&state.recorder);
    ctl.phase.store(PHASE_IDLE, Ordering::SeqCst);
    // Never erase a newer session when a previous worker finishes late.
    if slot
        .as_ref()
        .is_some_and(|session| Arc::ptr_eq(&session.ctl, ctl))
    {
        *slot = None;
    }
}

// ─────────────────────────────── pomoćno ───────────────────────────────

/// Odredišna datoteka u galeriji, s vremenskim pečatom u imenu.
fn output_path(app: &AppHandle, format: RecordFormat) -> Result<PathBuf, String> {
    let dir = crate::commands::gallery_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("ne mogu kreirati galeriju: {e}"))?;
    // Keep the full UUID: the former eight-character/32-bit suffix could
    // collide during long recording sessions or across shared folders.
    // Never intentionally target an existing user's recording.
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let name = format!(
        "Snapvere {} - {}.{}",
        chrono::Local::now().format("%Y-%m-%d %H.%M.%S"),
        suffix,
        format.ext()
    );
    Ok(dir.join(name))
}

#[cfg(test)]
mod recorder_start_tests {
    use super::*;

    #[test]
    fn start_guard_rejects_overlapping_initialization() {
        let first = RecorderStartGuard::acquire().expect("first launch guard");
        assert!(RecorderStartGuard::acquire().is_err());
        drop(first);
        assert!(RecorderStartGuard::acquire().is_ok());
    }

    #[test]
    fn failed_encoder_open_preserves_an_existing_recording() {
        let path = std::env::temp_dir().join(format!(
            "snapvere-existing-recording-{}.gif",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&path, b"original recording").expect("seed existing file");
        remove_owned_recording(&path, false);
        assert_eq!(
            std::fs::read(&path).expect("existing recording"),
            b"original recording"
        );
        remove_owned_recording(&path, true);
        assert!(!path.exists());
    }
}
