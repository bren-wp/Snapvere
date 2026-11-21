// Snapvere by Brendigo
//! Non-blocking, data-preserving application shutdown for active recordings.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::logging::log;
use crate::record;

const FINALIZE_WAIT: Duration = Duration::from_secs(60);
const STARTUP_POLL: Duration = Duration::from_millis(40);
static EXIT_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

fn must_defer_exit(active: bool, starting: bool) -> bool {
    active || starting
}

fn claim_worker(gate: &AtomicBool) -> bool {
    gate.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

/// Return true only if it is safe to let Tauri exit immediately.
/// When a recording is active, defer shutdown to one background worker.
pub fn allow_exit(app: &AppHandle) -> bool {
    if !must_defer_exit(record::is_active(app), record::is_starting()) {
        return true;
    }
    if claim_worker(&EXIT_WORKER_RUNNING) {
        let app = app.clone();
        let result = std::thread::Builder::new()
            .name("snapvere-shutdown".into())
            .spawn(move || {
                // The native codec can be initializing before the session appears.
                // Wait for that handshake so a simultaneous Quit does not kill it.
                let started = Instant::now();
                while record::is_starting() && started.elapsed() < FINALIZE_WAIT {
                    std::thread::sleep(STARTUP_POLL);
                }
                let finalized = if record::is_starting() {
                    false
                } else if record::is_active(&app) {
                    if let Err(error) = record::stop(&app) {
                        log(&format!("shutdown: recorder stop returned: {error}"));
                    }
                    let remaining = FINALIZE_WAIT.saturating_sub(started.elapsed());
                    record::wait_for_finalize(&app, remaining)
                } else {
                    true
                };
                EXIT_WORKER_RUNNING.store(false, Ordering::Release);
                if finalized && !must_defer_exit(record::is_active(&app), record::is_starting()) {
                    app.exit(0);
                } else {
                    // Keep the resident app alive; let the recording worker finish.
                    log("shutdown: recording still finalizing; exit prevented to protect media");
                }
            });
        if let Err(error) = result {
            EXIT_WORKER_RUNNING.store(false, Ordering::Release);
            log(&format!("shutdown: unable to start finalizer: {error}"));
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::{claim_worker, must_defer_exit};
    use std::sync::atomic::AtomicBool;

    #[test]
    fn only_one_shutdown_worker_may_start() {
        let gate = AtomicBool::new(false);
        assert!(claim_worker(&gate));
        assert!(!claim_worker(&gate));
        gate.store(false, std::sync::atomic::Ordering::Release);
        assert!(claim_worker(&gate));
    }

    #[test]
    fn shutdown_waits_for_a_recorder_still_initializing() {
        assert!(!must_defer_exit(false, false));
        assert!(must_defer_exit(true, false));
        assert!(must_defer_exit(false, true));
        assert!(must_defer_exit(true, true));
    }

    #[test]
    fn concurrent_claims_never_start_multiple_workers() {
        let gate = AtomicBool::new(false);
        let successes = std::thread::scope(|scope| {
            let tasks: Vec<_> = (0..16)
                .map(|_| scope.spawn(|| claim_worker(&gate)))
                .collect();
            tasks
                .into_iter()
                .map(|task| task.join().expect("worker join"))
                .filter(|success| *success)
                .count()
        });
        assert_eq!(successes, 1);
    }
}
