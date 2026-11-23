// Snapvere by Brendigo
//! Native Pro-only, explicit local folder batch export.
//! Never accept filesystem paths from the renderer or connect to cloud services.
use super::*;
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::{self, BufWriter, Cursor, Read};
use tauri_plugin_dialog::DialogExt;

const MAX_BATCH: usize = 100;
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 24_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BatchPreset {
    Original,
    Png,
    Png1280,
    Webp1920,
}

impl BatchPreset {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "original" => Ok(Self::Original),
            "png" => Ok(Self::Png),
            "png1280" => Ok(Self::Png1280),
            "webp1920" => Ok(Self::Webp1920),
            _ => Err("Unsupported Pro export preset".into()),
        }
    }

    fn extension(self, source_format: &str) -> Result<&'static str, String> {
        match self {
            Self::Original => accepted_extension(source_format),
            Self::Png | Self::Png1280 => Ok("png"),
            Self::Webp1920 => Ok("webp"),
        }
    }

    fn max_edge(self) -> Option<u32> {
        match self {
            Self::Png1280 => Some(1280),
            Self::Webp1920 => Some(1920),
            _ => None,
        }
    }
}

fn still_format(value: &str) -> Result<image::ImageFormat, String> {
    match value {
        "png" => Ok(image::ImageFormat::Png),
        "jpg" | "jpeg" => Ok(image::ImageFormat::Jpeg),
        "webp" => Ok(image::ImageFormat::WebP),
        _ => Err("Image presets require PNG, JPEG or WebP screenshots".into()),
    }
}

fn read_bounded_image(
    source: &Path,
    format: image::ImageFormat,
) -> Result<image::DynamicImage, String> {
    let metadata = fs::symlink_metadata(source).map_err(estr)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAX_IMAGE_BYTES
    {
        return Err("Invalid, redirected or oversized source image".into());
    }
    let mut bytes = Vec::new();
    File::open(source)
        .map_err(estr)?
        .take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(estr)?;
    if bytes.len() as u64 != metadata.len() {
        return Err("Source changed during image export".into());
    }
    let (width, height) = image::ImageReader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(estr)?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err("Image exceeds the safe Pro processing dimensions".into());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(estr)
}

fn transform_exclusively(
    source: &Path,
    destination: &Path,
    source_format: image::ImageFormat,
    preset: BatchPreset,
) -> Result<(), String> {
    let mut decoded = read_bounded_image(source, source_format)?;
    if let Some(edge) = preset
        .max_edge()
        .filter(|edge| decoded.width() > *edge || decoded.height() > *edge)
    {
        decoded = decoded.resize(edge, edge, image::imageops::FilterType::Lanczos3);
    }
    let format = match preset {
        BatchPreset::Png | BatchPreset::Png1280 => image::ImageFormat::Png,
        BatchPreset::Webp1920 => image::ImageFormat::WebP,
        BatchPreset::Original => return Err("Original preset requires byte-for-byte copy".into()),
    };
    // WebP accepts RGB/RGBA8, not grayscale or 16-bit source buffers.
    // Normalize only for WebP so PNG exports retain their original bit depth.
    if format == image::ImageFormat::WebP {
        decoded = image::DynamicImage::ImageRgba8(decoded.into_rgba8());
    }
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(estr)?;
    let mut writer = BufWriter::new(file);
    let result = decoded
        .write_to(&mut writer, format)
        .map_err(estr)
        .and_then(|()| {
            writer.flush().map_err(estr)?;
            writer.get_ref().sync_all().map_err(estr)
        });
    drop(writer);
    if let Err(error) = result {
        if let Err(cleanup) = fs::remove_file(destination) {
            log(&format!(
                "failed to remove incomplete Pro image output: {cleanup}"
            ));
        }
        return Err(error);
    }
    Ok(())
}

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
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAX_FILE_BYTES
    {
        return Err("Invalid, redirected or oversized gallery file".into());
    }
    let mut reader = File::open(source).map_err(estr)?;
    let mut writer = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(estr)?;
    let result = io::copy(&mut reader, &mut writer).and_then(|copied| {
        if copied != metadata.len() {
            return Err(io::Error::other("Source changed during export"));
        }
        writer.sync_all()
    });
    drop(writer);
    if let Err(error) = result {
        if let Err(cleanup) = fs::remove_file(destination) {
            log(&format!(
                "failed to remove incomplete Pro batch output: {cleanup}"
            ));
        }
        return Err(format!("Could not complete local export: {error}"));
    }
    Ok(())
}

pub(super) async fn export(
    app: AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<String>,
    preset: String,
) -> Result<u32, String> {
    validate_ids(&ids)?;
    let preset = BatchPreset::parse(&preset)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = image_export::SaveAsGuard::acquire()?;
        let state = app.state::<AppState>();
        let items = {
            let db = lock(&state.db);
            ids.iter()
                .map(|id| {
                    db.get(id)
                        .map_err(estr)?
                        .ok_or_else(|| "Gallery item no longer exists".into())
                })
                .collect::<Result<Vec<_>, String>>()?
        };
        // Reject incompatible selections before the picker or any file write.
        for shot in &items {
            if preset == BatchPreset::Original {
                accepted_extension(&shot.format)?;
            } else {
                if shot.source == "recording" {
                    return Err("Image presets do not convert recordings".into());
                }
                still_format(&shot.format)?;
            }
        }
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
        let mut completed = 0;
        for shot in items {
            let ext = preset.extension(&shot.format)?;
            let src = PathBuf::from(shot.file_path);
            let file = destination.join(format!(
                "Snapvere-Pro-{}.{}",
                uuid::Uuid::new_v4().simple(),
                ext
            ));
            if preset == BatchPreset::Original {
                copy_exclusively(&src, &file)?;
            } else {
                transform_exclusively(&src, &file, still_format(&shot.format)?, preset)?;
            }
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
        assert!(validate_ids(std::slice::from_ref(&id)).is_ok());
        assert!(validate_ids(&[]).is_err());
        assert!(validate_ids(&[id.clone(), id]).is_err());
        assert!(validate_ids(&["../secrets.txt".into()]).is_err());
        let too_many = (0..101)
            .map(|_| uuid::Uuid::new_v4().to_string())
            .collect::<Vec<_>>();
        assert!(validate_ids(&too_many).is_err());
    }

    #[test]
    fn image_presets_resize_without_upscaling_or_overwriting_sources() {
        let dir = std::env::temp_dir().join(format!("snapvere-pro-images-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).expect("create fixture");
        let source = dir.join("source.png");
        let target = dir.join("resized.png");
        let webp = dir.join("compact.webp");
        let pixels = image::RgbaImage::from_pixel(1600, 800, image::Rgba([25, 50, 75, 128]));
        pixels.save(&source).expect("write source");
        let before = fs::read(&source).expect("source bytes");
        transform_exclusively(
            &source,
            &target,
            image::ImageFormat::Png,
            BatchPreset::Png1280,
        )
        .expect("resize PNG");
        assert_eq!(image::image_dimensions(&target).unwrap(), (1280, 640));
        transform_exclusively(
            &source,
            &webp,
            image::ImageFormat::Png,
            BatchPreset::Webp1920,
        )
        .expect("convert WebP");
        let decoded = image::open(&webp).unwrap().to_rgba8();
        assert_eq!(decoded.dimensions(), (1600, 800));
        assert_eq!(*decoded.get_pixel(0, 0), image::Rgba([25, 50, 75, 128]));
        assert!(transform_exclusively(
            &source,
            &target,
            image::ImageFormat::Png,
            BatchPreset::Png,
        )
        .is_err());
        assert_eq!(fs::read(&source).unwrap(), before);
        assert!(BatchPreset::parse("arbitrary-path").is_err());
        assert!(still_format("gif").is_err());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn grayscale_png_is_supported_by_the_webp_preset() {
        let dir = std::env::temp_dir().join(format!("snapvere-pro-gray-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).expect("create fixture");
        let source = dir.join("gray.png");
        let output = dir.join("gray.webp");
        image::GrayImage::from_pixel(8, 4, image::Luma([123]))
            .save(&source)
            .expect("create grayscale source");
        transform_exclusively(
            &source,
            &output,
            image::ImageFormat::Png,
            BatchPreset::Webp1920,
        )
        .expect("convert grayscale");
        let decoded = image::open(&output).unwrap().to_rgba8();
        assert_eq!(decoded.dimensions(), (8, 4));
        assert_eq!(*decoded.get_pixel(0, 0), image::Rgba([123, 123, 123, 255]));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn symbolic_links_cannot_be_batch_exported() {
        use std::os::unix::fs::symlink;
        let dir = std::env::temp_dir().join(format!("snapvere-pro-links-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).expect("create test directory");
        let secret = dir.join("secret.png");
        let link = dir.join("gallery.png");
        let dest = dir.join("export.png");
        fs::write(&secret, b"private data").expect("seed secret");
        symlink(&secret, &link).expect("symlink fixture");
        assert!(copy_exclusively(&link, &dest).is_err());
        assert!(!dest.exists());
        assert!(read_bounded_image(&link, image::ImageFormat::Png).is_err());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn source_overwrite_is_rejected_and_only_whitelisted_media_exports() {
        let dir = std::env::temp_dir().join(format!("snapvere-pro-batch-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).expect("create fixture");
        let source = dir.join("capture.png");
        let target = dir.join("existing.png");
        fs::write(&source, b"private capture").expect("create source");
        fs::write(&target, b"existing user file").expect("create target");
        assert!(copy_exclusively(&source, &target).is_err());
        assert_eq!(
            fs::read(&target).expect("original intact"),
            b"existing user file"
        );
        assert_eq!(accepted_extension("png").unwrap(), "png");
        assert_eq!(accepted_extension("jpeg").unwrap(), "jpg");
        assert!(accepted_extension("exe").is_err());
        let good = dir.join("export.png");
        copy_exclusively(&source, &good).expect("copy selected capture");
        assert_eq!(fs::read(&good).expect("copied bytes"), b"private capture");
        fs::remove_dir_all(dir).expect("cleanup");
    }
}
