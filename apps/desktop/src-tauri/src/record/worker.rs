// Snapvere by Brendigo
//! Recorder worker loop. The worker owns frame capture and encoder finalization.

use super::pixels::{allocate_bgra, bgra_to_rgba_image, crop_bgra, pixelate_bgra};
use super::transport::Source;
use super::*;

#[allow(clippy::too_many_arguments)]
pub(super) fn run(
    app: &AppHandle,
    ctl: &Arc<Ctl>,
    path: &PathBuf,
    target: RecordTarget,
    opts: RecordOptions,
    fps: u32,
    crop: (u32, u32, u32, u32),
    ready: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<Recorded, String> {
    let (ox, oy, ow, oh) = crop;
    let t0 = Instant::now();

    let mut source = Source::open(&target)?;
    let (src_w, src_h) = source.size();
    let t_source = t0.elapsed();

    // MF sesija mora živjeti dulje od enkodera (Drop redoslijed je obrnut od deklaracije).
    #[cfg(windows)]
    let _mf = if matches!(opts.format, RecordFormat::Mp4) {
        Some(mp4::MfSession::start()?)
    } else {
        None
    };

    // Zvuk samo uz MP4 (GIF nema audio). Izvor koji se ne da otvoriti se preskače.
    #[cfg(windows)]
    let mixer = {
        let mut kinds = Vec::new();
        if matches!(opts.format, RecordFormat::Mp4) {
            if opts.mic {
                kinds.push(audio::Kind::Microphone);
            }
            if opts.system_audio {
                kinds.push(audio::Kind::SystemLoopback);
            }
        }
        if kinds.is_empty() {
            None
        } else {
            let m = audio::Mixer::start(&kinds);
            // Never start a video-only/single-source recording when the user
            // explicitly selected more audio inputs than WASAPI could open.
            ensure_audio_sources(&kinds, &m.kinds)?;
            ctl.mic.store(
                m.kinds.contains(&audio::Kind::Microphone),
                Ordering::Relaxed,
            );
            ctl.system_audio.store(
                m.kinds.contains(&audio::Kind::SystemLoopback),
                Ordering::Relaxed,
            );
            if m.is_empty() {
                None
            } else {
                Some(m)
            }
        }
    };
    #[cfg(not(windows))]
    let mixer: Option<()> = None;

    let mut encoder = open_encoder(
        path,
        opts.format,
        ow,
        oh,
        fps,
        opts.quality,
        mixer.is_some(),
    )?;
    // Linux experimental MP4 owns an anonymous inode until successful publication.
    let delayed_publication = cfg!(all(target_os = "linux", feature = "linux-native-media"))
        && opts.format == RecordFormat::Mp4;
    ctl.output_owned
        .store(!delayed_publication, Ordering::Release);

    #[cfg(windows)]
    let mut painter = cursor::CursorPainter::new();
    log(&format!(
        "snimanje krenulo: {ow}x{oh} @ {fps}fps, format {:?}, izvor {src_w}x{src_h} (izvor {:?}, enkoder {:?})",
        opts.format,
        t_source,
        t0.elapsed() - t_source
    ));

    let interval = Duration::from_secs_f64(1.0 / fps as f64);
    let dur_100ns = (interval.as_nanos() / 100) as i64;
    let started = Instant::now();
    // Audio i video dijele sat od ovog trenutka: sve što je mikrofon uhvatio prije
    // starta bi inače stajalo ispred prvog framea kao konstantan zaostatak.
    #[cfg(windows)]
    if let Some(m) = &mixer {
        m.clear();
        m.check_health()?;
    }
    // Zvuk se vuče s ~120 ms zakašnjenja za satom videa — toliko WASAPI-ju treba da
    // paket stigne; bez margine bismo rupu popunili tišinom pa pravi zvuk gurnuli kasnije.
    #[cfg(windows)]
    const AUDIO_LAG: Duration = Duration::from_millis(120);
    #[cfg(windows)]
    let mut audio_written: i64 = 0; // frameova @ 48 kHz
    let mut paused_total = Duration::ZERO;
    let mut pause_started: Option<Instant> = None;
    let mut next_due = Instant::now();
    let mut last_tick = Instant::now();
    let mut last_time_100ns = -1i64;

    let mut frame_buf = allocate_bgra(ow, oh)?;
    // Do not report READY before DXGI, Media Foundation, mixer, encoder and
    // frame buffers exist. A timed-out caller must not leave a live session.
    if ctl.cancel.load(Ordering::Acquire) {
        return Err("snimanje: inicijalizacija je otkazana".into());
    }
    ready
        .send(Ok(()))
        .map_err(|_| "snimanje: pozivatelj više ne čeka inicijalizaciju".to_string())?;
    let mut thumb: Option<image::RgbaImage> = None;
    let mut cancelled = false;
    let mut recording_error: Option<String> = None;
    // Dijagnostika: koliko obrada framea (grab+crop+kursor+blur+encode) stvarno traje.
    let mut work_total = Duration::ZERO;

    loop {
        if ctl.cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        if ctl.stop.load(Ordering::Relaxed) {
            break;
        }

        #[cfg(windows)]
        if let Some(m) = &mixer {
            if let Err(e) = m.check_health() {
                let error = format!("Recording stopped because requested audio failed: {e}");
                log(&error);
                recording_error = Some(error);
                break;
            }
        }

        // ── pauza ──
        if ctl.phase.load(Ordering::Relaxed) == PHASE_PAUSED {
            if pause_started.is_none() {
                pause_started = Some(Instant::now());
            }
            std::thread::sleep(Duration::from_millis(40));
            continue;
        }
        if let Some(p) = pause_started.take() {
            paused_total += p.elapsed();
            next_due = Instant::now();
            #[cfg(windows)]
            if let Some(m) = &mixer {
                m.clear();
            }
        }

        // ── tempo ──
        let now = Instant::now();
        if now < next_due {
            let wait = (next_due - now).min(Duration::from_millis(10));
            std::thread::sleep(wait);
            continue;
        }
        next_due += interval;
        if next_due < now {
            // Zaostali smo (težak frame, throttling) — preskoči rupu umjesto da juriš.
            next_due = now + interval;
        }

        // ── hvatanje ──
        let work_started = Instant::now();
        // Timeout ~0: tempo diktira sleep iznad, ne čekanje na novi frame. Ako se ekran
        // nije promijenio, DXGI vrati zadnji poznati frame — točno što želimo.
        let full = match source.grab(2) {
            Ok(f) => f,
            Err(e) => {
                let error = format!("snimanje: greška pri hvatanju framea — {e}");
                log(&error);
                recording_error = Some(error);
                break;
            }
        };
        crop_bgra(full, src_w, src_h, ox, oy, ow, oh, &mut frame_buf);
        if !source.has_frame() {
            // Statičan ekran odmah nakon starta: bolje kasniji prvi frame nego crni.
            continue;
        }

        #[cfg(windows)]
        if opts.capture_cursor {
            painter.draw(
                &mut frame_buf,
                ow,
                oh,
                target.monitor_x + ox as i32,
                target.monitor_y + oy as i32,
            );
        }

        // Redact ide POSLIJE kursora: ako je pokazivač nad zamagljenim poljem,
        // i on mora nestati. Destruktivno je — original nikad ne dođe do enkodera.
        {
            let rects = crate::state::lock(&ctl.blur);
            for r in rects.iter() {
                pixelate_bgra(&mut frame_buf, ow, oh, r);
            }
        }

        if thumb.is_none() {
            thumb = Some(bgra_to_rgba_image(&frame_buf, ow, oh));
        }

        // ── zapis ──
        let media = now.duration_since(started).saturating_sub(paused_total);
        let mut time_100ns = (media.as_nanos() / 100) as i64;
        // MF traži strogo rastuće timestampove.
        if time_100ns <= last_time_100ns {
            time_100ns = last_time_100ns + 1;
        }
        last_time_100ns = time_100ns;

        if let Err(e) = encoder.write(&frame_buf, time_100ns, dur_100ns) {
            let error = format!("snimanje: enkoder je odbio frame — {e}");
            log(&error);
            recording_error = Some(error);
            break;
        }

        #[cfg(windows)]
        if let Some(m) = &mixer {
            let due = ((media.saturating_sub(AUDIO_LAG)).as_secs_f64() * audio::RATE as f64) as i64;
            if let Err(e) = write_audio_until(&mut encoder, m, &mut audio_written, due) {
                let error = format!("snimanje: audio je odbijen — {e}");
                log(&error);
                recording_error = Some(error);
                break;
            }
        }

        let frames = ctl.frames.fetch_add(1, Ordering::Relaxed) + 1;
        ctl.elapsed_ms
            .store(media.as_millis() as u64, Ordering::Relaxed);
        work_total += work_started.elapsed();

        // ── HUD tick ~4x/s ──
        if last_tick.elapsed() >= Duration::from_millis(250) {
            last_tick = Instant::now();
            if let Ok(meta) = std::fs::metadata(path) {
                ctl.size_bytes.store(meta.len(), Ordering::Relaxed);
            }
            let _ = app.emit("snapvere:rec-tick", ctl.status());
        }

        // ── tvrdi limit trajanja ──
        if opts.max_seconds > 0 && media.as_secs() >= opts.max_seconds as u64 {
            log(&format!(
                "snimanje: dosegnut limit od {}s ({frames} frameova)",
                opts.max_seconds
            ));
            break;
        }
    }

    ctl.phase.store(PHASE_FINISHING, Ordering::SeqCst);
    let _ = app.emit("snapvere:rec-state", ctl.status());
    #[cfg(windows)]
    if let Some(m) = &mixer {
        if !cancelled && recording_error.is_none() {
            if let Err(e) = m.check_health() {
                recording_error = Some(format!("Requested WASAPI audio failed: {e}"));
            }
        }
        if !cancelled && recording_error.is_none() {
            // Treat even the final audio write as a recording failure.
            let end = ((last_time_100ns.max(0) as f64 / 1e7) * audio::RATE as f64) as i64;
            if let Err(e) = write_audio_until(&mut encoder, m, &mut audio_written, end) {
                recording_error = Some(format!("snimanje: završni audio zapis nije uspio — {e}"));
            }
        }
    }
    let frames = ctl.frames.load(Ordering::Relaxed).max(1);
    log(&format!(
        "snimanje: prosječna obrada framea {:.1} ms (budžet {:.1} ms @ {fps} fps)",
        work_total.as_secs_f64() * 1000.0 / frames as f64,
        1000.0 / fps as f64
    ));
    // An unpublished Linux MP4 is discarded on cancellation or runtime error.
    if delayed_publication && (cancelled || recording_error.is_some()) {
        drop(encoder);
        if let Some(error) = recording_error {
            return Err(error);
        }
        return Ok(Recorded {
            cancelled,
            width: ow,
            height: oh,
            thumb,
        });
    }
    // Finalize to release native file handles, but never commit a partial recording.
    let finalize_result = encoder.finish();
    if delayed_publication && finalize_result.is_ok() {
        ctl.output_owned.store(true, Ordering::Release);
    }
    drop(encoder);
    // The encoder's close/flush does not guarantee its bytes reached the
    // filesystem. Persist the finalized MP4/GIF before it is indexed in the
    // gallery; disk-full or interrupted writes must not report success.
    // Open with write access for Windows FlushFileBuffers compatibility.
    let durable_result = if delayed_publication {
        // The native encoder synced its exact opened inode before linking it.
        finalize_result
    } else {
        finalize_result.and_then(|()| {
            std::fs::OpenOptions::new()
                .write(true)
                .open(path)
                .and_then(|file| file.sync_all())
                .map_err(|error| format!("Could not persist recording: {error}"))
        })
    };
    recording_completion(recording_error, durable_result)?;

    Ok(Recorded {
        cancelled,
        width: ow,
        height: oh,
        thumb,
    })
}
