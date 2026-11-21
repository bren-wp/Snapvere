# Snapvere by Brendigo — protected recording shutdown

## Recording safety

When **Quit** is clicked while screen recording is active, the Tauri event
loop prevents the immediate process exit. Exactly one background worker
requests a safe recording stop and waits for the encoder and local gallery
registration to complete. The primary window remains responsive rather than
blocking its message loop for several seconds.

The worker allows a normal process exit only after the recording is no
longer active. If its 60-second protection window expires, Snapvere continues
running in the Windows notification area. The local diagnostics log records
that the file may still be finishing, and the user can try Quit again when
the encoder has completed. An operating-system forced shutdown, system crash,
disk failure, or Task Manager force-quit cannot be made data-safe by the
application's ordinary exit handler.

Closing Home with its X button still just hides the window. An explicit
**Quit** from the notification-area menu is required to leave the resident app.

## Implementation details

- Source: `apps/desktop/src-tauri/src/shutdown.rs`
- Tauri's `ExitRequested` event returns immediately after deferring exit;
  no native window callbacks wait for the encoder.
- The worker gate atomically rejects duplicate Quit requests and resets after
  finalization or timeout.
- Quit during the native codec handshake waits until the recorder has either
  started or failed before deciding whether to stop and finalize media.
- The recording worker remains responsible for writing the file, closing the
  encoder and registering media with SQLite.
- This change does not add cloud uploads, account requirements, administrative
  permissions or new platform-specific dependencies.

## Acceptance checklist

- [ ] Quit during an MP4 recording without audio; process exits after gallery commit
- [ ] Quit while GIF encoder finalizes a long recording; file remains playable
- [ ] Quit during paused capture; file is finalized, not discarded
- [ ] Click Quit repeatedly; only one shutdown worker operates
- [ ] Simulate delayed encoder beyond 60 seconds; application stays available
- [ ] Confirm native 100%, 125%, 150% and 200% scaling and tray responsiveness
- [ ] Run cargo tests, Clippy, RustSec, npm audit, frontend and installer CI
