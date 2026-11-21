//! Snapvere by Brendigo — bounded local diagnostics and panic capture.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

const MAX_LOG_BYTES: u64 = 512 * 1024;
const MAX_LOG_LINE_BYTES: usize = 16 * 1024;

pub fn init(app_data_dir: &Path) {
    let dir = app_data_dir.join("logs");
    let path = fs::create_dir_all(&dir)
        .ok()
        .map(|_| dir.join("snapvere.log"));

    let _ = LOG_PATH.set(path);
    log(&format!(
        "Snapvere by Brendigo {} started",
        env!("CARGO_PKG_VERSION")
    ));
}

fn normalize_log_message(msg: &str) -> String {
    let mut sanitized = String::with_capacity(msg.len().min(MAX_LOG_LINE_BYTES));
    for ch in msg.chars() {
        if sanitized.len() + ch.len_utf8() > MAX_LOG_LINE_BYTES {
            sanitized.push_str(" [truncated]");
            break;
        }
        if ch == '\n' || ch == '\r' || (ch.is_control() && ch != '\t') {
            sanitized.push(' ');
        } else {
            sanitized.push(ch);
        }
    }
    sanitized
}

fn rotate_if_oversize(path: &Path) {
    if !fs::metadata(path)
        .map(|meta| meta.len() >= MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        return;
    }

    let archive = path.with_extension("log.1");
    if let Err(error) = fs::remove_file(&archive) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return;
        }
    }
    let _ = fs::rename(path, archive);
}

pub fn log(msg: &str) {
    let message = normalize_log_message(msg);

    #[cfg(debug_assertions)]
    println!("[snapvere] {message}");

    let Some(Some(path)) = LOG_PATH.get() else {
        return;
    };

    let _guard = LOG_WRITE_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    rotate_if_oversize(path);

    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{stamp}  {message}");
    }
}

pub fn log_path() -> Option<PathBuf> {
    LOG_PATH.get().and_then(|path| path.clone())
}

pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|text| (*text).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<no message>".into());
        let thread = std::thread::current()
            .name()
            .unwrap_or("<unnamed>")
            .to_string();

        log(&format!("PANIC [{thread}] @ {location}: {payload}"));
        previous(info);
    }));
}

pub fn guard<T>(what: &str, callback: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(callback)) {
        Ok(result) => {
            if let Err(error) = &result {
                log(&format!("{what}: {error}"));
            }
            result
        }
        Err(_) => {
            let message = format!("{what}: internal error (panic caught)");
            log(&message);
            Err(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_log_message, MAX_LOG_LINE_BYTES};

    #[test]
    fn log_lines_cannot_forge_extra_entries() {
        assert_eq!(
            normalize_log_message("file.csv\n2026-01-01 fake warning\rsecret"),
            "file.csv 2026-01-01 fake warning secret"
        );
        assert_eq!(normalize_log_message("hello\0world"), "hello world");
    }

    #[test]
    fn logs_bound_untrusted_error_size_without_breaking_utf8() {
        let line = normalize_log_message(&"🛡️".repeat(10000));
        assert!(line.len() <= MAX_LOG_LINE_BYTES + " [truncated]".len());
        assert!(line.ends_with(" [truncated]"));
        assert!(!line.contains('\n'));
    }
}
