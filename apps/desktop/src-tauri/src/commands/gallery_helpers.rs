// Snapvere by Brendigo
//! Scope gallery files strictly by registered id, with bounded image decode.
use super::*;

/// Asset scope iz tauri.conf.json pokriva samo $HOME/$PICTURE/$APPDATA. Galerija
/// spremljena drugdje (npr. `D:\Snimke` iz Settingsa) inače bi u pregledniku
/// pokazala prazan okvir — pa dopustimo upravo mape u kojima su naši zapisi.
pub(super) fn allow_media_dirs(app: &AppHandle, items: &[Screenshot]) {
    let scope = app.asset_protocol_scope();
    for shot in items {
        for path_str in std::iter::once(shot.file_path.as_str()).chain(shot.thumb_path.as_deref()) {
            let path = Path::new(path_str);
            // Never authorize missing, redirected, non-regular or hard-linked
            // files. Keep the read handle during scope registration.
            let Ok((_file, size)) = crate::pinned_directory::open_bounded_source(path, u64::MAX)
            else {
                continue;
            };
            if path_str == shot.file_path.as_str() && size != shot.size_bytes {
                continue;
            }
            if !scope.is_allowed(path) {
                if let Err(e) = scope.allow_file(path) {
                    log(&format!("asset scope {}: {e}", path.display()));
                }
            }
        }
    }
}

// ─────────────────────────────── preglednik ───────────────────────────────
// Komande primaju id zapisa, ne putanju: webview tako ne može otvoriti ni
// kopirati ništa što nije u galeriji.

pub(super) fn media_path(app: &AppHandle, id: &str) -> Result<(PathBuf, fs::File), String> {
    let state = app.state::<AppState>();
    let shot = lock(&state.db)
        .get(id)
        .map_err(estr)?
        .ok_or("This item is no longer in the gallery")?;
    let path = PathBuf::from(shot.file_path);
    let file = verified_media_file(&path, shot.size_bytes)?;
    Ok((path, file))
}

fn verified_media_file(path: &Path, expected_size: u64) -> Result<fs::File, String> {
    let (file, size) = crate::pinned_directory::open_bounded_source(path, u64::MAX)?;
    if size != expected_size {
        return Err("Gallery file size changed".into());
    }
    Ok(file)
}

pub(super) const MAX_CLIPBOARD_FILE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_SHARE_BYTES: u64 = 16 * 1024 * 1024;

/// Retain a read handle across native consent and recheck the selected path.
/// This is a bounded snapshot, not a persisted capture-authenticity proof.
pub(super) struct ShareSource {
    file: fs::File,
    identity: String,
    metadata: fs::Metadata,
    size: u64,
}

fn share_metadata_matches(before: &fs::Metadata, after: &fs::Metadata) -> Result<bool, String> {
    let same = before.is_file()
        && after.is_file()
        && before.len() == after.len()
        && before.modified().map_err(estr)? == after.modified().map_err(estr)?;
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(same
            && after.nlink() == 1
            && before.ctime() == after.ctime()
            && before.ctime_nsec() == after.ctime_nsec())
    }
    #[cfg(not(target_os = "linux"))]
    Ok(same)
}

impl ShareSource {
    pub(super) fn open(path: &Path, gallery_size: u64) -> Result<Self, String> {
        let (file, size) = crate::pinned_directory::open_bounded_source(path, MAX_SHARE_BYTES)?;
        if size != gallery_size {
            return Err("Gallery file size changed".into());
        }
        let identity = crate::pinned_directory::file_identity(&file)?;
        let metadata = file.metadata().map_err(estr)?;
        Ok(Self {
            file,
            identity,
            metadata,
            size,
        })
    }

    fn verify_path(&self, path: &Path) -> Result<(), String> {
        let (current, size) = crate::pinned_directory::open_bounded_source(path, MAX_SHARE_BYTES)?;
        if size != self.size
            || crate::pinned_directory::file_identity(&current)? != self.identity
            || !share_metadata_matches(&self.metadata, &current.metadata().map_err(estr)?)?
            || !share_metadata_matches(&self.metadata, &self.file.metadata().map_err(estr)?)?
        {
            return Err("Share source changed".into());
        }
        Ok(())
    }

    pub(super) fn read_confirmed(mut self, path: &Path) -> Result<Vec<u8>, String> {
        use std::io::Read;

        self.verify_path(path)?;
        let size = usize::try_from(self.size).map_err(estr)?;
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(size)
            .map_err(|_| "Not enough memory to share capture".to_string())?;
        bytes.resize(size, 0);
        self.file.read_exact(&mut bytes).map_err(estr)?;
        let mut extra = [0_u8; 1];
        if self.file.read(&mut extra).map_err(estr)? != 0 {
            return Err("Share source changed size".into());
        }
        self.verify_path(path)?;
        Ok(bytes)
    }
}

pub(super) fn can_copy_image(file_bytes: u64, width: u32, height: u32) -> bool {
    file_bytes <= MAX_CLIPBOARD_FILE_BYTES
        && width > 0
        && height > 0
        && u64::from(width) * u64::from(height) <= MAX_EDITOR_PIXELS
}

/// Read once from a bounded source. Header validation and decoding
/// consume the same bytes rather than reopening a mutable pathname.
pub(super) fn decode_copy_image(path: &Path) -> Result<image::RgbaImage, String> {
    use std::io::{Cursor, Read};

    let (mut file, expected) =
        crate::pinned_directory::open_bounded_source(path, MAX_CLIPBOARD_FILE_BYTES)?;
    let size = usize::try_from(expected).map_err(estr)?;
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(size)
        .map_err(|_| "Not enough memory for clipboard image".to_string())?;
    bytes.resize(size, 0);
    file.read_exact(&mut bytes).map_err(estr)?;
    let mut extra = [0_u8; 1];
    if file.read(&mut extra).map_err(estr)? != 0 {
        return Err("Clipboard source changed size".into());
    }
    let mut header = image::ImageReader::new(Cursor::new(bytes.as_slice()))
        .with_guessed_format()
        .map_err(estr)?;
    let format = header
        .format()
        .ok_or("Unsupported clipboard image format")?;
    if !matches!(
        format,
        image::ImageFormat::Png
            | image::ImageFormat::Jpeg
            | image::ImageFormat::WebP
            | image::ImageFormat::Gif
    ) {
        return Err("Unsupported clipboard image format".into());
    }
    let mut header_limits = image::Limits::default();
    header_limits.max_alloc = Some(256 * 1024 * 1024);
    header.limits(header_limits);
    let (width, height) = header.into_dimensions().map_err(estr)?;
    if !can_copy_image(expected, width, height) {
        return Err("Clipboard image exceeds supported dimensions".into());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes.as_slice()), format);
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    Ok(reader.decode().map_err(estr)?.into_rgba8())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(any(windows, target_os = "linux"))]
    #[test]
    fn share_snapshot_checks_registered_size_and_returns_exact_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.png");
        fs::write(&path, b"capture data").unwrap();
        assert!(ShareSource::open(&path, 1).is_err());
        let source = ShareSource::open(&path, 12).unwrap();
        assert_eq!(source.read_confirmed(&path).unwrap(), b"capture data");
    }

    #[cfg(any(windows, target_os = "linux"))]
    #[test]
    fn share_snapshot_rejects_different_same_size_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.png");
        let other = dir.path().join("other.png");
        fs::write(&path, b"original").unwrap();
        fs::write(&other, b"replaced").unwrap();
        let source = ShareSource::open(&path, 8).unwrap();
        assert!(source.read_confirmed(&other).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read(&other).unwrap(), b"replaced");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn share_snapshot_rejects_path_replacement_during_consent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.png");
        let saved = dir.path().join("original.png");
        fs::write(&path, b"original").unwrap();
        let source = ShareSource::open(&path, 8).unwrap();
        fs::rename(&path, &saved).unwrap();
        fs::write(&path, b"replaced").unwrap();
        assert!(source.read_confirmed(&path).is_err());
        assert_eq!(fs::read(&saved).unwrap(), b"original");
        assert_eq!(fs::read(&path).unwrap(), b"replaced");
    }

    #[test]
    fn gallery_open_rejects_changed_size_and_hard_link() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.png");
        fs::write(&path, b"original").unwrap();
        assert!(verified_media_file(&path, 8).is_ok());
        assert!(verified_media_file(&path, 9).is_err());
        let alias = dir.path().join("alias.png");
        fs::hard_link(&path, &alias).unwrap();
        assert!(verified_media_file(&path, 8).is_err());
        assert!(verified_media_file(&alias, 8).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
    }

    #[test]
    fn clipboard_decodes_regular_image_and_rejects_hard_links() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("capture.png");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 255]))
            .save(&path)
            .unwrap();
        let decoded = decode_copy_image(&path).unwrap();
        assert_eq!(decoded.dimensions(), (2, 2));
        assert_eq!(*decoded.get_pixel(0, 0), image::Rgba([1, 2, 3, 255]));
        let alias = dir.path().join("alias.png");
        fs::hard_link(&path, &alias).unwrap();
        assert!(decode_copy_image(&path).is_err());
        assert!(decode_copy_image(&alias).is_err());
    }

    #[test]
    fn clipboard_rejects_invalid_and_oversized_sources() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("invalid.png");
        fs::write(&path, b"not an image").unwrap();
        assert!(decode_copy_image(&path).is_err());
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_CLIPBOARD_FILE_BYTES + 1).unwrap();
        drop(file);
        assert!(decode_copy_image(&path).is_err());
    }
}
