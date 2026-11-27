// Snapvere by Brendigo
//! Descriptor-relative read-only media access on macOS.
//! This does not enable journal mutations, directory export or gallery deletion.
use rustix::fs::{open, openat, Mode, OFlags};
use std::fs::File;
use std::os::unix::fs::MetadataExt;
use std::path::{Component, Path};

pub(super) fn open_bounded_source(source: &Path, max: u64) -> Result<(File, u64), String> {
    if !source.is_absolute() {
        return Err("An absolute media path is required".into());
    }
    let parent = source.parent().ok_or("Missing source directory")?;
    let name = source.file_name().ok_or("Missing source filename")?;
    let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
    let mut directory = open("/", flags, Mode::empty()).map_err(|error| error.to_string())?;
    for component in parent.components() {
        match component {
            Component::RootDir => {}
            Component::Normal(name) => {
                directory = openat(&directory, name, flags, Mode::empty())
                    .map_err(|error| error.to_string())?;
            }
            _ => return Err("Invalid directory component".into()),
        }
    }

    // Do not reopen an absolute path or use /dev/fd as a directory alias.
    let flags = OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC;
    let descriptor =
        openat(&directory, name, flags, Mode::empty()).map_err(|error| error.to_string())?;
    let reader = File::from(descriptor);
    let metadata = reader.metadata().map_err(|error| error.to_string())?;
    let size = metadata.len();
    if !metadata.is_file() || metadata.nlink() != 1 || size == 0 || size > max {
        return Err("Invalid, linked or oversized gallery file".into());
    }
    Ok((reader, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;
    use std::os::unix::fs::symlink;

    #[test]
    fn bounded_read_and_identity() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("capture.png");
        fs::write(&path, b"capture").unwrap();
        let (mut file, size) = open_bounded_source(&path, 7).unwrap();
        assert_eq!(size, 7);
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"capture");
        let (second, _) = open_bounded_source(&path, 7).unwrap();
        assert_eq!(
            super::super::file_identity(&file).unwrap(),
            super::super::file_identity(&second).unwrap()
        );
        assert!(open_bounded_source(&path, 6).is_err());
        assert!(open_bounded_source(Path::new("capture.png"), 7).is_err());
        fs::write(root.join("empty"), b"").unwrap();
        assert!(open_bounded_source(&root.join("empty"), 7).is_err());
        assert!(open_bounded_source(&root, 7).is_err());
    }

    #[test]
    fn rejects_redirects_and_hard_links() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let child = root.join("media");
        fs::create_dir(&child).unwrap();
        let path = child.join("capture.png");
        fs::write(&path, b"capture").unwrap();
        symlink(&child, root.join("redirect")).unwrap();
        symlink(&path, child.join("alias.png")).unwrap();
        assert!(open_bounded_source(&root.join("redirect/capture.png"), 7).is_err());
        assert!(open_bounded_source(&child.join("alias.png"), 7).is_err());
        assert!(open_bounded_source(&child.join("../media/capture.png"), 7).is_err());
        fs::hard_link(&path, child.join("hard.png")).unwrap();
        assert!(open_bounded_source(&path, 7).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"capture");
    }
}
