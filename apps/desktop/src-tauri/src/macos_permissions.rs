// Snapvere by Brendigo
//! Native screen-recording permission checks. Never request access at startup.
use std::sync::atomic::{AtomicBool, Ordering};

pub(crate) const SCREEN_CAPTURE_DENIED: &str =
    "Allow Snapvere in System Settings > Privacy & Security > Screen Recording, then reopen it.";

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

static REQUESTED: AtomicBool = AtomicBool::new(false);

fn has_access() -> bool {
    // SAFETY: CoreGraphics permission query takes no arguments or pointers.
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Never prompt from a recording worker, preview or background task.
pub(crate) fn require_screen_capture() -> Result<(), String> {
    if has_access() {
        Ok(())
    } else {
        Err(SCREEN_CAPTURE_DENIED.into())
    }
}

/// Called only in response to a capture action, not launch or polling.
/// Prompt at most once per process; subsequent attempts recheck permission.
pub(crate) fn request_for_user_capture() -> Result<(), String> {
    request_once(&REQUESTED, has_access, || {
        // SAFETY: documented system permission request with no arguments.
        unsafe { CGRequestScreenCaptureAccess() };
    })
}

fn request_once(
    requested: &AtomicBool,
    check: impl Fn() -> bool,
    request: impl FnOnce(),
) -> Result<(), String> {
    if check() {
        return Ok(());
    }
    if !requested.swap(true, Ordering::AcqRel) {
        request();
    }
    if check() {
        Ok(())
    } else {
        Err(SCREEN_CAPTURE_DENIED.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn permission_denial_never_reprompts_and_later_grant_is_recognized() {
        let requested = AtomicBool::new(false);
        let allowed = Cell::new(false);
        let prompts = Cell::new(0);
        let check = || allowed.get();
        let request = || prompts.set(prompts.get() + 1);
        assert!(request_once(&requested, check, request).is_err());
        assert!(request_once(&requested, check, request).is_err());
        assert_eq!(prompts.get(), 1);
        allowed.set(true);
        assert!(request_once(&requested, check, request).is_ok());
        assert_eq!(prompts.get(), 1);
    }

    #[test]
    fn permission_granted_during_request_is_recognized() {
        let requested = AtomicBool::new(false);
        let allowed = Cell::new(false);
        assert!(request_once(&requested, || allowed.get(), || allowed.set(true)).is_ok());
        assert!(requested.load(Ordering::Acquire));
    }

    #[test]
    fn already_authorized_capture_does_not_prompt() {
        let requested = AtomicBool::new(false);
        assert!(request_once(&requested, || true, || panic!("unexpected prompt")).is_ok());
        assert!(!requested.load(Ordering::Acquire));
    }
}
