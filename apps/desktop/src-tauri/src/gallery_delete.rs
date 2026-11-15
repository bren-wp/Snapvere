//! Crash-recoverable gallery deletion. Never unlink a registered capture first.
//!
//! A durable SQLite intent is written before moving media within its own volume.
//! An atomic SQLite commit then removes the gallery entry and marks the intent as
//! committed. On startup an uncommitted intent is rolled back; committed intents
//! finish deleting their staged files. No existing destination is overwritten.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use anyhow::{bail, ensure, Context, Result};
use uuid::Uuid;

use crate::db::{Db, PendingDeletion};
use crate::models::Screenshot;

fn stage_path(source: &Path, token: &str, kind: &str) -> Result<PathBuf> {
    ensure!(source.is_absolute(), "Gallery media path is not absolute");
    let parent = source.parent().context("Gallery media has no parent folder")?;
    Ok(parent.join(format!(".snapvere-delete-{token}-{kind}.pending")))
}

fn intent(shot: &Screenshot) -> Result<PendingDeletion> {
    let token = Uuid::new_v4().simple().to_string();
    let file = PathBuf::from(&shot.file_path);
    let thumbnail = shot.thumb_path.as_ref().map(PathBuf::from);
    if let Some(ref thumb) = thumbnail {
        ensure!(thumb != &file, "Gallery media and thumbnail paths overlap");
    }
    Ok(PendingDeletion {
        id: shot.id.clone(),
        file_path: shot.file_path.clone(),
        staged_file_path: stage_path(&file, &token, "media")?
            .to_string_lossy()
            .into_owned(),
        thumb_path: shot.thumb_path.clone(),
        staged_thumb_path: thumbnail
            .as_deref()
            .map(|path| stage_path(path, &token, "thumb"))
            .transpose()?
            .map(|path| path.to_string_lossy().into_owned()),
        committed: false,
    })
}

fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn stage_one(source: &str, staged: &str) -> Result<()> {
    let source = Path::new(source);
    let staged = Path::new(staged);
    if !exists(source)? {
        return Ok(());
    }
    // Never delete directories or follow symlinks supplied by a damaged DB.
    ensure!(
        fs::symlink_metadata(source)?.file_type().is_file(),
        "Gallery deletion requires a regular media file"
    );
    ensure!(!exists(staged)?, "Gallery deletion staging target already exists");
    fs::rename(source, staged).context("Could not stage media for deletion")
}

fn restore_one(source: &str, staged: &str) -> Result<()> {
    let source = Path::new(source);
    let staged = Path::new(staged);
    if exists(staged)? {
        ensure!(!exists(source)?, "Original gallery path already exists; refusing overwrite");
        fs::rename(staged, source).context("Could not restore staged gallery media")?;
    }
    Ok(())
}

fn delete_one(staged: &str) -> Result<()> {
    match fs::remove_file(staged) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).context("Could not clear committed deletion staging file"),
    }
}

fn stage_files(job: &PendingDeletion) -> Result<()> {
    stage_one(&job.file_path, &job.staged_file_path)?;
    if let (Some(source), Some(staged)) = (&job.thumb_path, &job.staged_thumb_path) {
        stage_one(source, staged)?;
    }
    Ok(())
}

fn restore_files(job: &PendingDeletion) -> Result<()> {
    // Try both paths even if the first restore failed; never overwrite a destination.
    let main = restore_one(&job.file_path, &job.staged_file_path);
    let thumb = match (&job.thumb_path, &job.staged_thumb_path) {
        (Some(source), Some(staged)) => restore_one(source, staged),
        _ => Ok(()),
    };
    main?;
    thumb
}

fn cleanup_files(job: &PendingDeletion) -> Result<()> {
    // Attempt both cleanups; a failure keeps the durable journal entry.
    let main = delete_one(&job.staged_file_path);
    let thumb = match &job.staged_thumb_path {
        Some(staged) => delete_one(staged),
        None => Ok(()),
    };
    main?;
    thumb
}

pub fn delete(db: &mut Db, id: &str) -> Result<()> {
    let shot = db.get(id)?.context("This capture is no longer in the gallery")?;
    let job = intent(&shot)?;
    db.prepare_delete(&job)?;

    if let Err(error) = stage_files(&job) {
        if let Err(restore_error) = restore_files(&job) {
            bail!("{error}; recovery is pending: {restore_error}");
        }
        db.forget_delete(id)?;
        return Err(error);
    }

    if let Err(error) = db.commit_delete(id) {
        // A commit error could have happened before or after it became durable.
        // Inspect the journal; never restore a file once its gallery row is gone.
        match db.pending_delete(id)? {
            Some(saved) if saved.committed => {
                crate::logging::log("Deletion committed; cleanup will retry on restart");
            }
            Some(saved) => {
                restore_files(&saved)
                    .context("Database commit failed; automatic media restore failed")?;
                db.forget_delete(id)?;
            }
            None => bail!("Database deletion state is uncertain; {error}"),
        }
        return Err(error);
    }

    if let Err(error) = cleanup_files(&job) {
        // The row is already removed; leave the committed journal for next launch.
        crate::logging::log(&format!("Gallery deletion cleanup deferred: {error}"));
        return Ok(());
    }
    db.forget_delete(id)?;
    Ok(())
}

pub fn recover(db: &Db) -> Result<()> {
    for job in db.pending_deletions()? {
        if job.committed {
            cleanup_files(&job).context("Could not complete a committed gallery deletion")?;
        } else {
            restore_files(&job).context("Could not restore interrupted gallery deletion")?;
        }
        db.forget_delete(&job.id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Screenshot;

    fn fixture() -> Result<(PathBuf, Db, Screenshot)> {
        let folder = std::env::temp_dir().join(format!("snapvere-delete-{}", Uuid::new_v4()));
        fs::create_dir_all(&folder)?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        let shot = Screenshot {
            id: Uuid::new_v4().to_string(),
            file_path: folder.join("capture.png").to_string_lossy().into_owned(),
            thumb_path: Some(folder.join("thumb.webp").to_string_lossy().into_owned()),
            name: "Test capture".into(),
            format: "png".into(),
            width: 2,
            height: 2,
            size_bytes: 4,
            source: "region".into(),
            created_at: 1,
            is_uploaded: false,
            tags: Vec::new(),
        };
        fs::write(&shot.file_path, b"original")?;
        fs::write(shot.thumb_path.as_deref().unwrap(), b"thumbnail")?;
        db.insert(&shot)?;
        Ok((folder, db, shot))
    }

    #[test]
    fn deletion_removes_both_files_and_index_without_pending_journal() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        db.add_tag(&shot.id, "important")?;
        delete(&mut db, &shot.id)?;
        assert!(db.get(&shot.id)?.is_none());
        assert!(!Path::new(&shot.file_path).exists());
        assert!(!Path::new(shot.thumb_path.as_deref().unwrap()).exists());
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn interrupted_precommit_deletion_restores_media_on_restart() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        assert!(!Path::new(&shot.file_path).exists());
        drop(db);
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_some());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(shot.thumb_path.as_deref().unwrap())?, b"thumbnail");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn interrupted_postcommit_deletion_clears_staged_files_on_restart() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        db.commit_delete(&shot.id)?;
        assert!(Path::new(&job.staged_file_path).exists());
        drop(db);
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_none());
        assert!(!Path::new(&job.staged_file_path).exists());
        assert!(!Path::new(job.staged_thumb_path.as_deref().unwrap()).exists());
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn failed_sqlite_delete_restores_original_and_thumbnail() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        {
            let guard = rusqlite::Connection::open(folder.join("gallery.sqlite"))?;
            guard.execute_batch(
                "CREATE TRIGGER block_delete BEFORE DELETE ON screenshots
                 BEGIN SELECT RAISE(FAIL, 'simulated database write failure'); END;",
            )?;
        }
        assert!(delete(&mut db, &shot.id).is_err());
        assert!(db.get(&shot.id)?.is_some());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(shot.thumb_path.as_deref().unwrap())?, b"thumbnail");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn sqlite_prepare_failure_leaves_original_media_untouched() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        {
            let guard = rusqlite::Connection::open(folder.join("gallery.sqlite"))?;
            guard.execute_batch(
                "CREATE TRIGGER block_prepare BEFORE INSERT ON pending_deletions
                 BEGIN SELECT RAISE(FAIL, 'simulated disk full'); END;",
            )?;
        }
        assert!(delete(&mut db, &shot.id).is_err());
        assert!(db.get(&shot.id)?.is_some());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(shot.thumb_path.as_deref().unwrap())?, b"thumbnail");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn unsafe_directory_media_cannot_be_deleted() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        fs::remove_file(&shot.file_path)?;
        fs::create_dir(&shot.file_path)?;
        assert!(delete(&mut db, &shot.id).is_err());
        assert!(Path::new(&shot.file_path).is_dir());
        assert!(db.get(&shot.id)?.is_some());
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }
}
