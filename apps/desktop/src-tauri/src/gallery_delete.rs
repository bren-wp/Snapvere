// Snapvere by Brendigo
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
use crate::pinned_directory::PinnedDirectory;

fn stage_path(source: &Path, token: &str, kind: &str) -> Result<PathBuf> {
    ensure!(source.is_absolute(), "Gallery media path is not absolute");
    let parent = source
        .parent()
        .context("Gallery media has no parent folder")?;
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
        file_identity: Some(capture_identity(&file)?),
        thumb_identity: thumbnail.as_deref().map(capture_identity).transpose()?,
    })
}

// Validate journal paths before touching either file. The staging name must
// be an exact generated sibling, never an arbitrary cleanup destination.
fn validate_stage_pair(source: &str, staged: &str, kind: &str) -> Result<Uuid> {
    let source = Path::new(source);
    let staged = Path::new(staged);
    ensure!(
        source.is_absolute()
            && source.file_name().is_some()
            && !source
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
            && staged.is_absolute()
            && source.parent() == staged.parent()
            && source != staged,
        "Invalid gallery deletion paths"
    );
    let name = staged
        .file_name()
        .and_then(|name| name.to_str())
        .context("Invalid staging filename")?;
    let suffix = format!("-{kind}.pending");
    let token = name
        .strip_prefix(".snapvere-delete-")
        .and_then(|name| name.strip_suffix(&suffix))
        .context("Invalid staging filename")?;
    let uuid = Uuid::parse_str(token).context("Invalid deletion token")?;
    ensure!(uuid.simple().to_string() == token, "Invalid deletion token");
    Ok(uuid)
}

fn validate_job(job: &PendingDeletion) -> Result<()> {
    let token = validate_stage_pair(&job.file_path, &job.staged_file_path, "media")?;
    match (&job.thumb_path, &job.staged_thumb_path) {
        (Some(source), Some(staged)) => {
            ensure!(
                validate_stage_pair(source, staged, "thumb")? == token
                    && source != &job.file_path
                    && source != &job.staged_file_path
                    && staged != &job.file_path,
                "Invalid thumbnail deletion intent"
            );
        }
        (None, None) => {}
        _ => bail!("Incomplete thumbnail deletion intent"),
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn rename_noreplace(source: &Path, destination: &Path) -> Result<()> {
    use rustix::fs::{renameat_with, RenameFlags, CWD};
    renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE)?;
    Ok(())
}

#[cfg(windows)]
fn rename_noreplace(source: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::MoveFileW;

    let wide = |path: &Path| -> Result<Vec<u16>> {
        let mut value: Vec<u16> = path.as_os_str().encode_wide().collect();
        ensure!(!value.contains(&0), "Invalid deletion path");
        value.push(0);
        Ok(value)
    };
    let source = wide(source)?;
    let destination = wide(destination)?;
    // SAFETY: both buffers are live, NUL-terminated UTF-16 strings.
    // MoveFileW fails if the target exists.
    unsafe { MoveFileW(PCWSTR(source.as_ptr()), PCWSTR(destination.as_ptr())) }?;
    Ok(())
}

#[cfg(not(any(target_os = "linux", windows)))]
fn rename_noreplace(_source: &Path, _destination: &Path) -> Result<()> {
    bail!("Safe gallery rename is unsupported on this platform")
}

fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

// The handle remains live for the complete filesystem operation. On Linux,
// paths resolve through the pinned directory descriptor; on Windows ancestor
// handles deny deletion sharing and reparse-point traversal.
fn pin_parent(path: &Path) -> Result<PinnedDirectory> {
    let parent = path
        .parent()
        .context("Media path has no containing folder")?;
    PinnedDirectory::open(parent).map_err(anyhow::Error::msg)
}

fn pinned_path(directory: &PinnedDirectory, path: &Path) -> Result<PathBuf> {
    Ok(directory
        .path
        .join(path.file_name().context("Media path has no filename")?))
}

fn open_leaf(path: &Path, delete_access: bool) -> Result<(fs::File, String)> {
    let before = fs::symlink_metadata(path)?;
    ensure!(
        before.is_file(),
        "Gallery operation requires a regular media file"
    );
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(not(windows))]
    let _ = delete_access;
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x00200000);
        if delete_access {
            // GENERIC_READ | DELETE; deny other write/delete opens.
            options.access_mode(0x80000000 | 0x00010000);
        }
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    ensure!(metadata.is_file(), "Gallery media changed type");
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ensure!(
            before.dev() == metadata.dev()
                && before.ino() == metadata.ino()
                && metadata.nlink() == 1,
            "Gallery file changed or has multiple hard links"
        );
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: file owns the live handle and info is writable.
        unsafe { GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info) }?;
        ensure!(
            metadata.file_attributes() & 0x400 == 0 && info.nNumberOfLinks == 1,
            "Redirected or multiply linked gallery file"
        );
    }
    let identity = crate::pinned_directory::file_identity(&file).map_err(anyhow::Error::msg)?;
    Ok((file, identity))
}

fn leaf_identity(path: &Path) -> Result<String> {
    open_leaf(path, false).map(|(_, identity)| identity)
}

fn capture_identity(path: &Path) -> Result<String> {
    let directory = pin_parent(path)?;
    let path = pinned_path(&directory, path)?;
    let parent = directory.identity().map_err(anyhow::Error::msg)?;
    let leaf = if exists(&path)? {
        leaf_identity(&path)?
    } else {
        "missing".to_owned()
    };
    Ok(format!("{parent}|{leaf}"))
}

fn checked_leaf<'a>(directory: &PinnedDirectory, identity: Option<&'a str>) -> Result<&'a str> {
    let (parent, leaf) = identity
        .and_then(|value| value.split_once('|'))
        .context("Deletion journal has no verified filesystem identity")?;
    ensure!(
        directory.identity().map_err(anyhow::Error::msg)? == parent,
        "Gallery directory identity changed"
    );
    Ok(leaf)
}

fn verify_leaf(path: &Path, expected: &str) -> Result<()> {
    ensure!(
        expected != "missing" && leaf_identity(path)? == expected,
        "Gallery media identity changed"
    );
    Ok(())
}

fn stage_one(source: &str, staged: &str, identity: Option<&str>) -> Result<()> {
    let source = Path::new(source);
    let staged = Path::new(staged);
    let directory = pin_parent(source)?;
    let expected = checked_leaf(&directory, identity)?;
    let source = pinned_path(&directory, source)?;
    let staged = pinned_path(&directory, staged)?;
    ensure!(!exists(&staged)?, "Unexpected staging file");
    if expected == "missing" {
        ensure!(!exists(&source)?, "Previously absent gallery media appeared");
        return Ok(());
    }
    verify_leaf(&source, expected)?;
    rename_noreplace(&source, &staged).context("Could not stage media for deletion")?;
    verify_leaf(&staged, expected)
}

fn restore_one(source: &str, staged: &str, identity: Option<&str>) -> Result<()> {
    let source = Path::new(source);
    let staged = Path::new(staged);
    let directory = pin_parent(source)?;
    let expected = checked_leaf(&directory, identity)?;
    let source = pinned_path(&directory, source)?;
    let staged = pinned_path(&directory, staged)?;
    if expected == "missing" {
        ensure!(
            !exists(&source)? && !exists(&staged)?,
            "Unexpected media for missing-file intent"
        );
        return Ok(());
    }
    if exists(&staged)? {
        verify_leaf(&staged, expected)?;
        rename_noreplace(&staged, &source).context("Could not restore staged gallery media")?;
    }
    verify_leaf(&source, expected)?;
    directory.sync_entries().map_err(anyhow::Error::msg)
}

#[cfg(windows)]
fn remove_verified(path: &Path, expected: &str) -> Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        FileDispositionInfo, SetFileInformationByHandle, FILE_DISPOSITION_INFO,
    };

    let (file, identity) = open_leaf(path, true)?;
    ensure!(identity == expected, "Gallery media identity changed");
    let info = FILE_DISPOSITION_INFO { DeleteFile: true };
    // SAFETY: the verified File owns the live DELETE-capable handle;
    // info is a correctly sized, initialized Windows ABI structure.
    unsafe {
        SetFileInformationByHandle(
            HANDLE(file.as_raw_handle()),
            FileDispositionInfo,
            (&info as *const FILE_DISPOSITION_INFO).cast(),
            std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
        )
    }?;
    drop(file);
    ensure!(!exists(path)?, "Gallery cleanup remains pending");
    Ok(())
}

#[cfg(not(windows))]
fn remove_verified(path: &Path, expected: &str) -> Result<()> {
    // Linux unlink remains pathname-based; do not claim an atomic identity
    // compare-and-unlink against another process running as the same user.
    verify_leaf(path, expected)?;
    fs::remove_file(path).context("Could not clear committed deletion staging file")
}

fn delete_one(staged: &str, identity: Option<&str>) -> Result<()> {
    let staged = Path::new(staged);
    let directory = pin_parent(staged)?;
    let expected = checked_leaf(&directory, identity)?;
    let staged = pinned_path(&directory, staged)?;
    if exists(&staged)? {
        remove_verified(&staged, expected)?;
    }
    directory.sync_entries().map_err(anyhow::Error::msg)
}

fn stage_files(job: &PendingDeletion) -> Result<()> {
    validate_job(job)?;
    stage_one(
        &job.file_path,
        &job.staged_file_path,
        job.file_identity.as_deref(),
    )?;
    if let (Some(source), Some(staged)) = (&job.thumb_path, &job.staged_thumb_path) {
        stage_one(source, staged, job.thumb_identity.as_deref())?;
    }
    Ok(())
}

// Recheck the complete staging set before the SQLite commit, not merely
// each individual rename. This still cannot make pathname operations atomic.
fn verify_staged_files(job: &PendingDeletion) -> Result<()> {
    let verify = |source: &str, staged: &str, identity: Option<&str>| -> Result<()> {
        let directory = pin_parent(Path::new(source))?;
        let expected = checked_leaf(&directory, identity)?;
        let source = pinned_path(&directory, Path::new(source))?;
        let staged = pinned_path(&directory, Path::new(staged))?;
        ensure!(!exists(&source)?, "Original gallery path reappeared");
        if expected == "missing" {
            ensure!(!exists(&staged)?, "Unexpected staging file");
        } else {
            verify_leaf(&staged, expected)?;
        }
        directory.sync_entries().map_err(anyhow::Error::msg)
    };
    verify(
        &job.file_path,
        &job.staged_file_path,
        job.file_identity.as_deref(),
    )?;
    if let (Some(source), Some(staged)) = (&job.thumb_path, &job.staged_thumb_path) {
        verify(source, staged, job.thumb_identity.as_deref())?;
    }
    Ok(())
}

fn restore_files(job: &PendingDeletion) -> Result<()> {
    validate_job(job)?;
    // Try both paths even if the first restore failed; never overwrite a destination.
    let main = restore_one(
        &job.file_path,
        &job.staged_file_path,
        job.file_identity.as_deref(),
    );
    let thumb = match (&job.thumb_path, &job.staged_thumb_path) {
        (Some(source), Some(staged)) => restore_one(source, staged, job.thumb_identity.as_deref()),
        _ => Ok(()),
    };
    main?;
    thumb
}

fn cleanup_files(job: &PendingDeletion) -> Result<()> {
    validate_job(job)?;
    // Attempt both cleanups; a failure keeps the durable journal entry.
    let main = delete_one(&job.staged_file_path, job.file_identity.as_deref());
    let thumb = match &job.staged_thumb_path {
        Some(staged) => delete_one(staged, job.thumb_identity.as_deref()),
        None => Ok(()),
    };
    main?;
    thumb
}

pub fn delete(db: &mut Db, id: &str) -> Result<()> {
    let shot = db
        .get(id)?
        .context("This capture is no longer in the gallery")?;
    let job = intent(&shot)?;
    validate_job(&job)?;
    db.prepare_delete(&job)?;

    if let Err(error) = stage_files(&job).and_then(|()| verify_staged_files(&job)) {
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

fn recover_job(db: &Db, job: &PendingDeletion) -> Result<()> {
    let current = db.get(&job.id)?;
    if job.committed {
        ensure!(
            current.is_none(),
            "Committed deletion still has a gallery row"
        );
        cleanup_files(job).context("Could not complete a committed gallery deletion")
    } else {
        let shot = current.context("Uncommitted deletion has no gallery row")?;
        ensure!(
            shot.file_path == job.file_path && shot.thumb_path == job.thumb_path,
            "Recovery journal does not match gallery media"
        );
        restore_files(job).context("Could not restore interrupted gallery deletion")
    }
}

pub fn recover(db: &Db) -> Result<()> {
    for job in db.pending_deletions()? {
        let result = recover_job(db, &job);
        if let Err(error) = result {
            // A locked file, disconnected media drive or transient access error
            // must not make the whole app unavailable. Retain the journal for
            // a future startup; never drop an un-restored capture reference.
            crate::logging::log(&format!(
                "Deferred recovery for gallery item {}: {error:#}",
                job.id
            ));
            continue;
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
        fs::create_dir_all(folder.join("media"))?;
        let shot = Screenshot {
            id: Uuid::new_v4().to_string(),
            file_path: folder
                .join("media")
                .join("capture.png")
                .to_string_lossy()
                .into_owned(),
            thumb_path: Some(
                folder
                    .join("media")
                    .join("thumb.webp")
                    .to_string_lossy()
                    .into_owned(),
            ),
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
    fn multiply_linked_gallery_media_is_not_deleted() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        let alias = folder.join("alias.png");
        fs::hard_link(&shot.file_path, &alias)?;
        assert!(delete(&mut db, &shot.id).is_err());
        assert!(db.get(&shot.id)?.is_some());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(&alias)?, b"original");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn prepare_rejects_a_journal_that_does_not_match_the_gallery() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let mut job = intent(&shot)?;
        job.file_path = folder.join("other.png").to_string_lossy().into_owned();
        assert!(db.prepare_delete(&job).is_err());
        assert!(db.pending_deletions()?.is_empty());
        assert!(db.get(&shot.id)?.is_some());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn recovery_rejects_a_journal_that_does_not_match_the_gallery() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let mut job = intent(&shot)?;
        job.file_path = folder.join("other.png").to_string_lossy().into_owned();
        assert!(recover_job(&db, &job).is_err());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert!(db.get(&shot.id)?.is_some());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn rename_never_replaces_an_existing_destination() -> Result<()> {
        let folder = tempfile::tempdir()?;
        let source = folder.path().join("source.png");
        let target = folder.path().join("target.png");
        fs::write(&source, b"source")?;
        fs::write(&target, b"target")?;
        assert!(rename_noreplace(&source, &target).is_err());
        assert_eq!(fs::read(source)?, b"source");
        assert_eq!(fs::read(target)?, b"target");
        Ok(())
    }

    #[test]
    fn invalid_staging_journal_cannot_delete_unrelated_file() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let victim = folder.join("unrelated.png");
        fs::write(&victim, b"keep")?;
        let mut job = intent(&shot)?;
        job.staged_file_path = victim.to_string_lossy().into_owned();
        assert!(stage_files(&job).is_err());
        assert!(restore_files(&job).is_err());
        assert!(cleanup_files(&job).is_err());
        assert_eq!(fs::read(&victim)?, b"keep");
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
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
    fn staged_directory_cannot_replace_media_during_recovery() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;

        let staged = PathBuf::from(&job.staged_file_path);
        let backup = folder.join("staged-media-backup.tmp");
        fs::rename(&staged, &backup)?;
        fs::create_dir(&staged)?;
        drop(db);

        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_some());
        assert!(db.pending_delete(&shot.id)?.is_some());
        assert!(staged.is_dir());
        assert!(!Path::new(&shot.file_path).exists());
        drop(db);

        fs::remove_dir(&staged)?;
        fs::rename(&backup, &staged)?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
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
    fn recovery_retains_intent_when_media_directory_is_replaced() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        let media = folder.join("media");
        let offline = folder.join("offline");
        fs::rename(&media, &offline)?;
        fs::create_dir(&media)?;
        drop(db);

        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_some());
        assert!(db.pending_delete(&shot.id)?.is_some());
        assert!(!Path::new(&shot.file_path).exists());
        drop(db);

        fs::remove_dir(&media)?;
        fs::rename(&offline, &media)?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(shot.thumb_path.as_deref().unwrap())?, b"thumbnail");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn recovery_keeps_intent_while_media_drive_is_unavailable() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        fs::rename(folder.join("media"), folder.join("offline"))?;
        drop(db);

        // The database remains available. An absent file on an unavailable
        // volume must not be mistaken for completed restoration.
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_some());
        assert!(db.pending_delete(&shot.id)?.is_some());
        drop(db);

        fs::rename(folder.join("offline"), folder.join("media"))?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert_eq!(fs::read(shot.thumb_path.as_deref().unwrap())?, b"thumbnail");
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[cfg(windows)]
    #[test]
    fn verified_windows_cleanup_defers_while_file_is_locked() -> Result<()> {
        use std::os::windows::fs::OpenOptionsExt;

        let folder = tempfile::tempdir()?;
        let path = folder.path().join("staged.png");
        fs::write(&path, b"original")?;
        let expected = leaf_identity(&path)?;
        let guard = fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)?;
        assert!(remove_verified(&path, &expected).is_err());
        assert_eq!(fs::read(&path)?, b"original");
        drop(guard);
        assert!(remove_verified(&path, "unexpected identity").is_err());
        assert_eq!(fs::read(&path)?, b"original");
        remove_verified(&path, &expected)?;
        assert!(!path.exists());
        Ok(())
    }

    #[test]
    fn committed_cleanup_rejects_replaced_regular_file() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        db.commit_delete(&shot.id)?;
        let backup = folder.join("original-staged.png");
        fs::rename(&job.staged_file_path, &backup)?;
        fs::write(&job.staged_file_path, b"unrelated")?;
        drop(db);
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert_eq!(fs::read(&job.staged_file_path)?, b"unrelated");
        assert!(db.pending_delete(&shot.id)?.is_some());
        drop(db);
        fs::remove_file(&job.staged_file_path)?;
        fs::rename(&backup, &job.staged_file_path)?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.pending_deletions()?.is_empty());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn legacy_intent_without_identity_never_removes_media() -> Result<()> {
        let (folder, db, shot) = fixture()?;
        let mut job = intent(&shot)?;
        job.file_identity = None;
        job.thumb_identity = None;
        db.prepare_delete(&job)?;
        assert!(recover_job(&db, &job).is_err());
        assert_eq!(fs::read(&shot.file_path)?, b"original");
        assert!(db.pending_delete(&shot.id)?.is_some());
        drop(db);
        fs::remove_dir_all(folder)?;
        Ok(())
    }

    #[test]
    fn committed_cleanup_failure_does_not_block_startup() -> Result<()> {
        let (folder, mut db, shot) = fixture()?;
        let job = intent(&shot)?;
        db.prepare_delete(&job)?;
        stage_files(&job)?;
        db.commit_delete(&shot.id)?;
        let blocked = PathBuf::from(&job.staged_file_path);
        let backup = folder.join("pending-backup.tmp");
        fs::rename(&blocked, &backup)?;
        // A directory at the staged file location forces cleanup to fail
        // portably, just as a Windows sharing violation can prevent deletion.
        fs::create_dir(&blocked)?;
        drop(db);

        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(db.get(&shot.id)?.is_none());
        assert!(db.pending_delete(&shot.id)?.is_some());
        drop(db);

        fs::remove_dir(&blocked)?;
        fs::rename(&backup, &blocked)?;
        let db = Db::open(&folder.join("gallery.sqlite"))?;
        assert!(!blocked.exists());
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
