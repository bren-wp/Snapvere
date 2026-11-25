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

// Hold each Linux directory by descriptor; do not follow any path-component
// symlink. On Windows, hold ancestor directory handles without delete sharing
// and reject reparse points. The picker and initial open are still separate.
struct PinnedDirectory {
    path: PathBuf,
    #[cfg(target_os = "linux")]
    _directory: File,
    #[cfg(windows)]
    _ancestors: Vec<File>,
}

impl PinnedDirectory {
    fn open(path: &Path) -> Result<Self, String> {
        if !path.is_absolute() {
            return Err("Export requires an absolute directory".into());
        }
        #[cfg(target_os = "linux")]
        {
            use rustix::fs::{open, openat, Mode, OFlags};
            use std::os::fd::AsRawFd;
            use std::path::Component;

            let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
            let mut directory = open("/", flags, Mode::empty()).map_err(estr)?;
            for component in path.components() {
                match component {
                    Component::RootDir => {}
                    Component::Normal(name) => {
                        directory = openat(&directory, name, flags, Mode::empty()).map_err(estr)?;
                    }
                    _ => return Err("Invalid directory component".into()),
                }
            }
            let directory = File::from(directory);
            let path = PathBuf::from(format!("/proc/self/fd/{}", directory.as_raw_fd()));
            Ok(Self {
                path,
                _directory: directory,
            })
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
            let mut ancestors = Vec::new();
            for ancestor in path.ancestors().collect::<Vec<_>>().into_iter().rev() {
                if !ancestor.is_absolute() {
                    continue;
                }
                let directory = OpenOptions::new()
                    .read(true)
                    .share_mode(3) // FILE_SHARE_READ | FILE_SHARE_WRITE, no delete sharing
                    .custom_flags(0x02200000) // BACKUP_SEMANTICS | OPEN_REPARSE_POINT
                    .open(ancestor)
                    .map_err(estr)?;
                let metadata = directory.metadata().map_err(estr)?;
                if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
                    return Err("Redirected directory is not supported for export".into());
                }
                ancestors.push(directory);
            }
            Ok(Self {
                path: path.to_path_buf(),
                _ancestors: ancestors,
            })
        }
        #[cfg(not(any(target_os = "linux", windows)))]
        {
            let metadata = fs::symlink_metadata(path).map_err(estr)?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err("Invalid export directory".into());
            }
            Ok(Self {
                path: path.to_path_buf(),
            })
        }
    }
}

fn open_bounded_source(source: &Path, max: u64) -> Result<(File, u64), String> {
    let parent = PinnedDirectory::open(source.parent().ok_or("Missing source directory")?)?;
    let name = source.file_name().ok_or("Missing source filename")?;
    let source = parent.path.join(name);
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x00200000);
    }
    let before = fs::symlink_metadata(&source).map_err(estr)?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err("Invalid or redirected gallery file".into());
    }
    let reader = options.open(&source).map_err(estr)?;
    let metadata = reader.metadata().map_err(estr)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: reader owns the live handle and info is valid writable storage.
        unsafe { GetFileInformationByHandle(HANDLE(reader.as_raw_handle()), &mut info) }
            .map_err(estr)?;
        if metadata.file_attributes() & 0x400 != 0 || info.nNumberOfLinks != 1 {
            return Err("Redirected or multiply linked gallery file".into());
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != metadata.dev() || before.ino() != metadata.ino() || metadata.nlink() != 1
        {
            return Err("Source changed or has multiple hard links".into());
        }
    }
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > max {
        return Err("Invalid or oversized gallery file".into());
    }
    Ok((reader, metadata.len()))
}

// Linux stages in an anonymous inode, not a pathname another process could
// replace between writing and publishing. Link the exact opened inode after
// sync, without replacing any existing destination.
#[cfg(target_os = "linux")]
fn publish_exclusively(
    destination: &Path,
    write: impl FnOnce(&mut File) -> Result<(), String>,
) -> Result<(), String> {
    use rustix::fs::{linkat, openat, AtFlags, Mode, OFlags, CWD};
    use std::os::fd::AsRawFd;

    let parent = destination.parent().ok_or("Missing export directory")?;
    let name = destination.file_name().ok_or("Missing export filename")?;
    let directory = File::open(parent).map_err(estr)?;
    let flags = OFlags::TMPFILE | OFlags::RDWR | OFlags::CLOEXEC;
    let mut staged = File::from(
        openat(&directory, ".", flags, Mode::RUSR | Mode::WUSR)
            .map_err(|error| format!("Destination does not support secure staging: {error}"))?,
    );
    write(&mut staged)?;
    staged.sync_all().map_err(estr)?;
    let descriptor = format!("/proc/self/fd/{}", staged.as_raw_fd());
    linkat(
        CWD,
        descriptor.as_str(),
        &directory,
        name,
        AtFlags::SYMLINK_FOLLOW,
    )
    .map_err(estr)?;
    // Publication succeeded; do not report a failed copy and induce a duplicate
    // retry just because this filesystem does not support directory fsync.
    if let Err(error) = directory.sync_all() {
        log(&format!(
            "Export published; directory sync unavailable: {error}"
        ));
    }
    Ok(())
}

// Windows uses same-filesystem staging and no-clobber publication. The named
// staging entry is still subject to same-user manipulation; audit separately.
#[cfg(not(target_os = "linux"))]
fn publish_exclusively(
    destination: &Path,
    write: impl FnOnce(&mut File) -> Result<(), String>,
) -> Result<(), String> {
    let parent = destination.parent().ok_or("Missing export directory")?;
    let mut staged = tempfile::Builder::new()
        .prefix(".snapvere-")
        .suffix(".partial")
        .tempfile_in(parent)
        .map_err(estr)?;
    write(staged.as_file_mut())?;
    staged.as_file().sync_all().map_err(estr)?;
    staged
        .persist_noclobber(destination)
        .map_err(|error| estr(error.error))?;
    Ok(())
}

fn copy_bounded(
    reader: &mut impl Read,
    writer: &mut impl std::io::Write,
    expected: u64,
) -> io::Result<()> {
    // Write no more than the validated initial size even if a source grows.
    let copied = io::copy(&mut (&mut *reader).take(expected), writer)?;
    let mut extra = [0_u8; 1];
    if copied != expected || reader.read(&mut extra)? != 0 {
        return Err(io::Error::other("Source changed during export"));
    }
    Ok(())
}

fn export_results<T>(
    items: impl IntoIterator<Item = (String, T)>,
    mut export_one: impl FnMut(T) -> Result<(), String>,
) -> Vec<crate::models::BatchExportItem> {
    items
        .into_iter()
        .map(|(id, item)| crate::models::BatchExportItem {
            id,
            succeeded: export_one(item).is_ok(),
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BatchPreset {
    Original,
    Png,
    Png1280,
    Png1920,
    Png3840,
    Webp,
    Webp1280,
    Webp1920,
}

impl BatchPreset {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "original" => Ok(Self::Original),
            "png" => Ok(Self::Png),
            "png1280" => Ok(Self::Png1280),
            "png1920" => Ok(Self::Png1920),
            "png3840" => Ok(Self::Png3840),
            "webp" => Ok(Self::Webp),
            "webp1280" => Ok(Self::Webp1280),
            "webp1920" => Ok(Self::Webp1920),
            _ => Err("Unsupported Pro export preset".into()),
        }
    }

    fn extension(self, source_format: &str) -> Result<&'static str, String> {
        match self {
            Self::Original => accepted_extension(source_format),
            Self::Png | Self::Png1280 | Self::Png1920 | Self::Png3840 => Ok("png"),
            Self::Webp | Self::Webp1280 | Self::Webp1920 => Ok("webp"),
        }
    }

    fn max_edge(self) -> Option<u32> {
        match self {
            Self::Png1280 | Self::Webp1280 => Some(1280),
            Self::Png1920 | Self::Webp1920 => Some(1920),
            Self::Png3840 => Some(3840),
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

#[derive(Default)]
struct BatchImageScratch {
    bytes: Vec<u8>,
}

impl BatchImageScratch {
    fn clear(&mut self) {
        self.bytes.fill(0);
        self.bytes.clear();
    }

    fn decode(
        &mut self,
        source: &Path,
        format: image::ImageFormat,
    ) -> Result<image::DynamicImage, String> {
        self.clear();
        let result = self.decode_inner(source, format);
        self.clear();
        result
    }

    fn decode_inner(
        &mut self,
        source: &Path,
        format: image::ImageFormat,
    ) -> Result<image::DynamicImage, String> {
        let (mut reader, expected) = open_bounded_source(source, MAX_IMAGE_BYTES)?;
        let size = usize::try_from(expected).map_err(estr)?;
        self.bytes
            .try_reserve_exact(size)
            .map_err(|_| "Not enough memory for Pro image export".to_string())?;
        self.bytes.resize(size, 0);
        reader.read_exact(&mut self.bytes).map_err(estr)?;
        let mut extra = [0_u8; 1];
        if reader.read(&mut extra).map_err(estr)? != 0 {
            return Err("Source changed during image export".into());
        }
        let (width, height) =
            image::ImageReader::with_format(Cursor::new(self.bytes.as_slice()), format)
                .into_dimensions()
                .map_err(estr)?;
        if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
            return Err("Image exceeds the safe Pro processing dimensions".into());
        }
        let mut reader =
            image::ImageReader::with_format(Cursor::new(self.bytes.as_slice()), format);
        let mut limits = image::Limits::default();
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        reader.decode().map_err(estr)
    }
}

impl Drop for BatchImageScratch {
    fn drop(&mut self) {
        self.clear();
    }
}

#[cfg(test)]
fn read_bounded_image(
    source: &Path,
    format: image::ImageFormat,
) -> Result<image::DynamicImage, String> {
    BatchImageScratch::default().decode(source, format)
}

#[cfg(test)]
fn transform_exclusively(
    source: &Path,
    destination: &Path,
    source_format: image::ImageFormat,
    preset: BatchPreset,
) -> Result<(), String> {
    transform_with_scratch(
        source,
        destination,
        source_format,
        preset,
        &mut BatchImageScratch::default(),
    )
}

fn transform_with_scratch(
    source: &Path,
    destination: &Path,
    source_format: image::ImageFormat,
    preset: BatchPreset,
    scratch: &mut BatchImageScratch,
) -> Result<(), String> {
    let mut decoded = scratch.decode(source, source_format)?;
    if let Some(edge) = preset
        .max_edge()
        .filter(|edge| decoded.width() > *edge || decoded.height() > *edge)
    {
        decoded = decoded.resize(edge, edge, image::imageops::FilterType::Lanczos3);
    }
    let format = match preset {
        BatchPreset::Png | BatchPreset::Png1280 | BatchPreset::Png1920 | BatchPreset::Png3840 => {
            image::ImageFormat::Png
        }
        BatchPreset::Webp | BatchPreset::Webp1280 | BatchPreset::Webp1920 => {
            image::ImageFormat::WebP
        }
        BatchPreset::Original => return Err("Original preset requires byte-for-byte copy".into()),
    };
    // WebP accepts RGB/RGBA8, not grayscale or 16-bit source buffers.
    // Normalize only for WebP so PNG exports retain their original bit depth.
    if format == image::ImageFormat::WebP {
        decoded = image::DynamicImage::ImageRgba8(decoded.into_rgba8());
    }
    publish_exclusively(destination, |file| {
        let mut writer = BufWriter::new(file);
        decoded.write_to(&mut writer, format).map_err(estr)?;
        writer.flush().map_err(estr)
    })
}

fn validate_ids(ids: &[String]) -> Result<(), String> {
    if ids.is_empty() || ids.len() > MAX_BATCH {
        return Err("Choose between one and 100 gallery items".into());
    }
    let mut seen = HashSet::with_capacity(ids.len());
    for id in ids {
        let canonical = uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == *id);
        if !canonical || !seen.insert(id) {
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
    let (mut reader, expected) = open_bounded_source(source, MAX_FILE_BYTES)?;
    publish_exclusively(destination, |writer| {
        copy_bounded(&mut reader, writer, expected).map_err(estr)
    })
}

pub(super) async fn export(
    app: AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<String>,
    preset: String,
) -> Result<crate::models::BatchExportReport, String> {
    validate_ids(&ids)?;
    let preset = BatchPreset::parse(&preset)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = image_export::SaveAsGuard::acquire()?;
        let state = app.state::<AppState>();
        let items = {
            let db = lock(&state.db);
            ids.into_iter()
                .map(|id| {
                    let shot = db.get(&id).map_err(estr)?;
                    Ok((id, shot))
                })
                .collect::<Result<Vec<_>, String>>()?
        };
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Export selected Snapvere Pro captures")
            .blocking_pick_folder();
        let Some(folder) = selected else {
            return Ok(crate::models::BatchExportReport {
                cancelled: true,
                items: Vec::new(),
            });
        };
        let destination = folder.into_path().map_err(estr)?;
        // Native picker decides the directory; don't accept a renderer path.
        let destination = PinnedDirectory::open(&destination)?;
        let mut scratch = BatchImageScratch::default();
        let items = export_results(items, |shot| {
            let shot = shot.ok_or_else(|| "Gallery item no longer exists".to_string())?;
            if preset != BatchPreset::Original && shot.source == "recording" {
                return Err("Image presets do not convert recordings".into());
            }
            let ext = preset.extension(&shot.format)?;
            let src = PathBuf::from(shot.file_path);
            let file = destination.path.join(format!(
                "Snapvere-Pro-{}.{}",
                uuid::Uuid::new_v4().simple(),
                ext
            ));
            if preset == BatchPreset::Original {
                copy_exclusively(&src, &file)
            } else {
                transform_with_scratch(&src, &file, still_format(&shot.format)?, preset, &mut scratch)
            }
        });
        Ok(crate::models::BatchExportReport {
            cancelled: false,
            items,
        })
    })
    .await
    .map_err(|error| format!("Local export task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_results_preserve_order_and_continue_after_failure() {
        let report = export_results(
            [
                ("first".into(), true),
                ("second".into(), false),
                ("third".into(), true),
            ],
            |success| {
                if success {
                    Ok(())
                } else {
                    Err("write failed".into())
                }
            },
        );
        assert_eq!(report.len(), 3);
        assert_eq!(report[1].id, "second");
        assert!(report[0].succeeded);
        assert!(!report[1].succeeded);
        assert!(report[2].succeeded);
    }

    #[test]
    fn bounded_copy_detects_growth_and_truncation() {
        let mut output = Vec::new();
        assert!(copy_bounded(&mut Cursor::new(b"abcd"), &mut output, 3).is_err());
        assert_eq!(output, b"abc");
        output.clear();
        assert!(copy_bounded(&mut Cursor::new(b"a"), &mut output, 3).is_err());
        assert_eq!(output, b"a");
        output.clear();
        assert!(copy_bounded(&mut Cursor::new(b"abc"), &mut output, 3).is_ok());
        assert_eq!(output, b"abc");
    }

    #[test]
    fn rejects_duplicate_invalid_and_oversized_batch_requests() {
        let id = uuid::Uuid::new_v4().to_string();
        assert!(validate_ids(std::slice::from_ref(&id)).is_ok());
        assert!(validate_ids(&[]).is_err());
        assert!(validate_ids(&["ABCDEF12-3456-7890-ABCD-EF1234567890".into()]).is_err());
        assert!(validate_ids(&[id.clone(), id]).is_err());
        assert!(validate_ids(&["../secrets.txt".into()]).is_err());
        let too_many = (0..101)
            .map(|_| uuid::Uuid::new_v4().to_string())
            .collect::<Vec<_>>();
        assert!(validate_ids(&too_many).is_err());
    }

    #[test]
    fn image_presets_resize_without_upscaling_or_overwriting_sources() {
        let dir =
            std::env::temp_dir().join(format!("snapvere-pro-images-{}", uuid::Uuid::new_v4()));
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
        assert!(
            transform_exclusively(&source, &target, image::ImageFormat::Png, BatchPreset::Png,)
                .is_err()
        );
        assert_eq!(fs::read(&source).unwrap(), before);
        assert!(BatchPreset::parse("arbitrary-path").is_err());
        assert!(still_format("gif").is_err());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn expanded_presets_preserve_originals_and_do_not_enlarge() {
        let dir = tempfile::tempdir().expect("fixture directory");
        let source = dir.path().join("source.png");
        image::RgbaImage::from_pixel(2000, 20, image::Rgba([12, 34, 56, 128]))
            .save(&source)
            .unwrap();
        let before = fs::read(&source).unwrap();
        for (name, extension, dimensions) in [
            ("png1920", "png", (1920, 19)),
            ("png3840", "png", (2000, 20)),
            ("webp", "webp", (2000, 20)),
            ("webp1280", "webp", (1280, 13)),
        ] {
            let preset = BatchPreset::parse(name).unwrap();
            assert_eq!(preset.extension("png").unwrap(), extension);
            let output = dir.path().join(format!("{name}.{extension}"));
            transform_exclusively(&source, &output, image::ImageFormat::Png, preset).unwrap();
            assert_eq!(image::image_dimensions(&output).unwrap(), dimensions);
            assert_eq!(
                image::open(&output).unwrap().to_rgba8().get_pixel(0, 0).0[3],
                128
            );
            assert!(
                transform_exclusively(&source, &output, image::ImageFormat::Png, preset).is_err()
            );
        }
        assert_eq!(fs::read(&source).unwrap(), before);
    }

    #[test]
    fn batch_scratch_reuses_allocation_and_clears_after_failure() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("image.png");
        let broken = dir.path().join("broken.png");
        image::RgbaImage::from_pixel(32, 32, image::Rgba([12, 34, 56, 128]))
            .save(&source)
            .unwrap();
        fs::write(&broken, b"not a png").unwrap();
        let mut scratch = BatchImageScratch::default();
        assert!(scratch.decode(&source, image::ImageFormat::Png).is_ok());
        assert!(scratch.bytes.is_empty());
        let capacity = scratch.bytes.capacity();
        let address = scratch.bytes.as_ptr();
        assert!(scratch.decode(&broken, image::ImageFormat::Png).is_err());
        assert!(scratch.bytes.is_empty());
        assert!(scratch.decode(&source, image::ImageFormat::Png).is_ok());
        assert_eq!(scratch.bytes.capacity(), capacity);
        assert_eq!(scratch.bytes.as_ptr(), address);
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
    fn failed_staging_never_publishes_a_partial_file() {
        let dir = tempfile::tempdir().expect("fixture");
        let target = dir.path().join("capture.png");
        let result = publish_exclusively(&target, |file| {
            file.write_all(b"partial").map_err(estr)?;
            Err("simulated disk failure".into())
        });
        assert!(result.is_err());
        assert!(!target.exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn multiply_linked_sources_are_rejected() {
        let dir = tempfile::tempdir().expect("fixture");
        let source = dir.path().join("original.png");
        let linked = dir.path().join("linked.png");
        fs::write(&source, b"private").expect("source");
        fs::hard_link(&source, &linked).expect("hard link");
        assert!(open_bounded_source(&linked, MAX_FILE_BYTES).is_err());
        assert!(open_bounded_source(&source, MAX_FILE_BYTES).is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn staged_inode_has_no_name_and_collision_never_replaces_user_data() {
        let dir = tempfile::tempdir().expect("fixture");
        let target = dir.path().join("capture.png");
        let result = publish_exclusively(&target, |file| {
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
            file.write_all(b"private capture").map_err(estr)?;
            // Simulate a competing creator during export.
            fs::write(&target, b"existing user data").map_err(estr)
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"existing user data");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn pinned_directory_survives_path_replacement_without_redirecting_output() {
        let dir = tempfile::tempdir().expect("fixture");
        let selected = dir.path().join("selected");
        let moved = dir.path().join("moved");
        fs::create_dir(&selected).unwrap();
        let pinned = PinnedDirectory::open(&selected).unwrap();
        fs::rename(&selected, &moved).unwrap();
        fs::create_dir(&selected).unwrap();
        publish_exclusively(&pinned.path.join("capture.png"), |file| {
            file.write_all(b"complete").map_err(estr)
        })
        .unwrap();
        assert!(!selected.join("capture.png").exists());
        assert_eq!(fs::read(moved.join("capture.png")).unwrap(), b"complete");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn symlinked_parent_is_rejected() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().expect("fixture");
        let real = dir.path().join("real");
        let link = dir.path().join("link");
        fs::create_dir(&real).unwrap();
        fs::write(real.join("capture.png"), b"private").unwrap();
        symlink(&real, &link).unwrap();
        assert!(PinnedDirectory::open(&link).is_err());
        assert!(open_bounded_source(&link.join("capture.png"), MAX_FILE_BYTES).is_err());
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
