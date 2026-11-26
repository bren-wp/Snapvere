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

pub(super) fn media_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let state = app.state::<AppState>();
    let shot = lock(&state.db)
        .get(id)
        .map_err(estr)?
        .ok_or("This item is no longer in the gallery")?;
    let path = PathBuf::from(shot.file_path);
    if !path.exists() {
        return Err("The file was moved or deleted".into());
    }
    Ok(path)
}

pub(super) const MAX_CLIPBOARD_FILE_BYTES: u64 = 200 * 1024 * 1024;

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
