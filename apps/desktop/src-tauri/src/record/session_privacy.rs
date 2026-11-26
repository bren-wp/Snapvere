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

    pub(super) fn replace_blur(
        &self,
        requested: &str,
        rects: &[PixelRect],
        viewport: (u32, u32),
        surface: (u32, u32),
        scale: f64,
    ) -> Result<(), String> {
        self.check_live_session(requested)?;
        if surface != (self.width, self.height) {
            return Err("Redaction window does not match the recording dimensions".into());
        }
        let mapped = pixels::map_redaction_rects(rects, viewport, surface, scale)?;
        let bounded = bounded_blur_rects(&mapped, self.width, self.height)?;
        *crate::state::lock(&self.blur) = bounded;
        Ok(())
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
    fn pause_guard_rejects_stale_missing_and_terminal_session() {
        assert!(validate_session("new", "old", PHASE_RECORDING).is_err());
        assert!(validate_session("new", "", PHASE_PAUSED).is_err());
        assert!(validate_session("new", "new", PHASE_IDLE).is_err());
        assert!(validate_session("new", "new", PHASE_FINISHING).is_err());
        assert!(validate_session("new", "new", PHASE_RECORDING).is_ok());
        assert!(validate_session("new", "new", PHASE_PAUSED).is_ok());
    }
}
