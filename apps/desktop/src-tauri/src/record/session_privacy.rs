// Snapvere by Brendigo
//! Session-scoped recording privacy mutations. Callers hold the recorder slot lock.

use super::*;

fn validate_session(active: &str, requested: &str, phase: u8) -> Result<(), String> {
    if active != requested || requested.is_empty() {
        return Err("Recording session has changed".into());
    }
    if !matches!(phase, PHASE_RECORDING | PHASE_PAUSED) {
        return Err("Recording session is no longer active".into());
    }
    Ok(())
}

impl Ctl {
    pub(super) fn check_live_session(&self, requested: &str) -> Result<(), String> {
        validate_session(
            &self.session_id,
            requested,
            self.phase.load(Ordering::Acquire),
        )
    }

    /// Called while holding the recorder slot lock. An unscoped native stop
    /// is permitted for the tray/hotkey; discarding always needs a session.
    pub(super) fn request_finish(
        &self,
        requested: Option<&str>,
        discard: bool,
    ) -> Result<(), String> {
        if let Some(expected) = requested {
            self.check_live_session(expected)?;
        } else if discard {
            return Err("Discard requires a recording session".into());
        }
        if discard {
            self.cancel.store(true, Ordering::SeqCst);
        }
        self.stop.store(true, Ordering::SeqCst);
        self.phase.store(PHASE_FINISHING, Ordering::SeqCst);
        Ok(())
    }

    pub(super) fn replace_blur(
        &self,
        requested: &str,
        rects: &[PixelRect],
        viewport: (u32, u32),
        surface: (u32, u32),
        scale: f64,
    ) -> Result<u64, String> {
        self.check_live_session(requested)?;
        if surface != (self.width, self.height) {
            return Err("Redaction window does not match the recording dimensions".into());
        }
        let mapped = pixels::map_redaction_rects(rects, viewport, surface, scale)?;
        let bounded = bounded_blur_rects(&mapped, self.width, self.height)?;
        let mut masks = crate::state::lock(&self.blur);
        let revision = self
            .blur_revision
            .load(Ordering::Relaxed)
            .checked_add(1)
            .ok_or("Recording mask revision exhausted")?;
        *masks = bounded;
        self.blur_revision.store(revision, Ordering::Release);
        Ok(revision)
    }

    /// The revision belongs to the exact mask set used for this frame.
    pub(super) fn apply_frame_masks(&self, frame: &mut [u8]) -> u64 {
        let masks = crate::state::lock(&self.blur);
        let revision = self.blur_revision.load(Ordering::Relaxed);
        for mask in masks.iter() {
            pixels::pixelate_bgra(frame, self.width, self.height, mask);
        }
        revision
    }

    /// Called only after the encoder accepts this frame. Acceptance is not
    /// proof of durable file finalization or irreversible content concealment.
    pub(super) fn acknowledge_encoded_masks(&self, revision: u64) {
        self.encoded_blur_revision
            .fetch_max(revision, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorder() -> Ctl {
        Ctl {
            session_id: "new-session".into(),
            phase: AtomicU8::new(PHASE_RECORDING),
            stop: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            elapsed_ms: AtomicU64::new(0),
            frames: AtomicU64::new(0),
            size_bytes: AtomicU64::new(0),
            width: 100,
            height: 100,
            format: RecordFormat::Gif,
            blur: Mutex::new(Vec::new()),
            blur_revision: AtomicU64::new(0),
            encoded_blur_revision: AtomicU64::new(0),
            preview: None,
            pause_ack: AtomicBool::new(false),
            started: Instant::now(),
            mic: AtomicBool::new(false),
            system_audio: AtomicBool::new(false),
            output_owned: AtomicBool::new(false),
        }
    }

    #[test]
    fn stale_set_and_clear_preserve_current_session_masks() {
        let ctl = recorder();
        let mask = PixelRect {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
        };
        let size = (100, 100);
        ctl.replace_blur("new-session", &[mask], size, size, 1.0)
            .unwrap();
        assert!(ctl
            .replace_blur("old-session", &[], size, size, 1.0)
            .is_err());
        assert!(ctl
            .replace_blur("old-session", &[mask], size, size, 1.0)
            .is_err());
        let masks = crate::state::lock(&ctl.blur);
        assert_eq!(masks.len(), 1);
        assert_eq!(masks[0].x, 10);
        assert_eq!(masks[0].width, 20);
    }

    #[test]
    fn only_the_revision_used_for_the_encoded_frame_is_acknowledged() {
        let ctl = recorder();
        let size = (100, 100);
        let mask = PixelRect {
            x: 0,
            y: 0,
            width: 20,
            height: 20,
        };
        let first = ctl
            .replace_blur("new-session", &[mask], size, size, 1.0)
            .unwrap();
        let mut frame = vec![0; 100 * 100 * 4];
        frame[0] = 255;
        let captured = ctl.apply_frame_masks(&mut frame);
        assert_eq!(captured, first);
        assert_ne!(frame[0], 255);
        assert_eq!(ctl.status().encoded_blur_revision, 0);

        let next = ctl
            .replace_blur("new-session", &[], size, size, 1.0)
            .unwrap();
        assert_eq!(next, first + 1);
        ctl.acknowledge_encoded_masks(captured);
        assert_eq!(ctl.status().encoded_blur_revision, first);
        assert_eq!(ctl.status().blur_revision, next);
        let captured = ctl.apply_frame_masks(&mut frame);
        ctl.acknowledge_encoded_masks(captured);
        assert_eq!(ctl.status().encoded_blur_revision, next);
        ctl.acknowledge_encoded_masks(first);
        assert_eq!(ctl.status().encoded_blur_revision, next);
    }

    #[test]
    fn stale_or_unscoped_discard_cannot_destroy_current_recording() {
        let ctl = recorder();
        assert!(ctl.request_finish(Some("old-session"), true).is_err());
        assert!(ctl.request_finish(None, true).is_err());
        assert!(ctl.request_finish(Some("old-session"), false).is_err());
        assert!(!ctl.stop.load(Ordering::Acquire));
        assert!(!ctl.cancel.load(Ordering::Acquire));
        assert_eq!(ctl.phase.load(Ordering::Acquire), PHASE_RECORDING);
        ctl.request_finish(Some("new-session"), false).unwrap();
        assert!(ctl.stop.load(Ordering::Acquire));
        assert!(!ctl.cancel.load(Ordering::Acquire));
        assert!(ctl.request_finish(Some("new-session"), true).is_err());
        assert!(!ctl.cancel.load(Ordering::Acquire));
    }

    #[test]
    fn matching_active_session_can_be_discarded() {
        let ctl = recorder();
        ctl.request_finish(Some("new-session"), true).unwrap();
        assert!(ctl.stop.load(Ordering::Acquire));
        assert!(ctl.cancel.load(Ordering::Acquire));
        assert_eq!(ctl.phase.load(Ordering::Acquire), PHASE_FINISHING);
    }

    #[test]
    fn pause_guard_rejects_stale_missing_and_terminal_session() {
        assert!(validate_session("new", "old", PHASE_RECORDING).is_err());
        assert!(validate_session("new", "", PHASE_PAUSED).is_err());
        assert!(validate_session("new", "new", PHASE_IDLE).is_err());
        assert!(validate_session("new", "new", PHASE_FINISHING).is_err());
        assert!(validate_session("new", "new", PHASE_RECORDING).is_ok());
        assert!(validate_session("new", "new", PHASE_PAUSED).is_ok());
    }
}
