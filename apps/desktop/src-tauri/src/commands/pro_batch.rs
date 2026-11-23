// Snapvere by Brendigo
//! Native Pro-only, explicit local folder batch export.
//! Never accept filesystem paths from the renderer or connect to cloud services.
use super::*;
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io;
use tauri_plugin_dialog::DialogExt;

const MAX_BATCH: usize = 100;
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024 * 1024;

fn validate_ids(ids: &[String]) -> Result<(), String> {
    if ids.is_empty() || ids.len() > MAX_BATCH {
        return Err("Choose between one and 100 gallery items".into());
    }
    let mut seen = HashSet::with_capacity(ids.len());
    for id in ids {
        if uuid::Uuid::parse_str(id).is_err() || !seen.insert(id) {
            return Err("Invalid or duplicate gallery item".into());
        }
    }
    Ok(())
}

fn accepted_extension(format: &str) -> Result<&'static str, String> {
    match format {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        "gif" => Ok("gif"),
        "mp4" => Ok("mp4"),
        _ => Err("Unsupported media format".into()),
    }
}

fn copy_exclusively(source: &Path, destination: &Path) -> Result<(), String> {
    // Symlinks in the gallery must not turn a batch operation into a private
    // file-exfiltration primitive. The destination path is generated, not input.
    let metadata = fs::symlink_metadata(source).map_err(estr)?;
    if !metadata.is_file() || metadata.file_type().is_symlink()
        || metadata.len() == 0 || metadata.len() > MAX_FILE_BYTES
    {
        return Err("Invalid, redirected or oversized gallery file".into());
    }
    let mut reader = File::open(source).map_err(estr)?;
    let mut writer = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(estr)?;
    let result = io::copy(&mut reader, &mut writer)
        .and_then(|copied| {
            if copied != metadata.len() {
                return Err(io::Error::other("Source changed during export"));
            }
            writer.sync_all()
        });
    drop(writer);
    if let Err(error) = result {
        if let Err(cleanup) = fs::remove_file(destination) {
            log(&format!("failed to remove incomplete Pro batch output: {cleanup}"));
        }
        return Err(format!("Could not complete local export: {error}"));
    }
    Ok(())
}

pub(super) async fn export(
    app: AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<String>,
) -> Result<u32, String> {
    validate_ids(&ids)?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Export selected Snapvere Pro captures")
            .blocking_pick_folder();
        let Some(folder) = selected else {
            return Ok(0);
        };
        let destination = folder.into_path().map_err(estr)?;
        // Native picker decides the directory; don't accept a renderer path.
        let metadata = fs::symlink_metadata(&destination).map_err(estr)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Selected folder is invalid".into());
        }
        let state = app.state::<AppState>();
        let items = {
            let db = lock(&state.db);
            ids.iter()
                .map(|id| {
                    db.get(id).map_err(estr)?.ok_or_else(|| "Gallery item no longer exists".into())
                })
                .collect::<Result<Vec<_>, String>>()?
        };
        let mut completed = 0;
        for shot in items {
            let ext = accepted_extension(&shot.format)?;
            let src = PathBuf::from(shot.file_path);
            let file = destination.join(format!(
                "Snapvere-Pro-{}.{}",
                uuid::Uuid::new_v4().simple(),
                ext
            ));
            copy_exclusively(&src, &file)?;
            completed += 1;
        }
        Ok(completed)
    })
    .await
    .map_err(|error| format!("Local export task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_invalid_and_oversized_batch_requests() {
        let id = uuid::Uuid::new_v4().to_string();
        assert!(validate_ids(&[id.clone()]).is_ok());
        assert!(validate_ids(&[]).is_err());
        assert!(validate_ids(&[id.clone(), id]).is_err());
        assert!(validate_ids(&["../secrets.txt".into()]).is_err());
        let too_many = (0..101).map(|_| uuid::Uuid::new_v4().to_string()).collect::<Vec<_>>();
        assert!(validate_ids(&too_many).is_err());
    }

    #[test]
    fn source_overwrite_is_rejected_and_only_whitelisted_media_exports() {
        let dir = std::env::temp_dir()
            .join(format!("snapvere-pro-batch-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).expect("create fixture");
        let source = dir.join("capture.png");
        let target = dir.join("existing.png");
        fs::write(&source, b"private capture").expect("create source");
        fs::write(&target, b"existing user file").expect("create target");
        assert!(copy_exclusively(&source, &target).is_err());
        assert_eq!(fs::read(&target).expect("original intact"), b"existing user file");
        assert_eq!(accepted_extension("png").unwrap(), "png");
        assert_eq!(accepted_extension("jpeg").unwrap(), "jpg");
        assert!(accepted_extension("exe").is_err());
        let good = dir.join("export.png");
        copy_exclusively(&source, &good).expect("copy selected capture");
        assert_eq!(fs::read(&good).expect("copied bytes"), b"private capture");
        fs::remove_dir_all(dir).expect("cleanup");
    }
}
