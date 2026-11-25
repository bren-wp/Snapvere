// Snapvere by Brendigo
//! Shared native directory ownership for media export and gallery recovery.
use std::fs::File;
use std::path::{Path, PathBuf};

// Hold each Linux directory by descriptor; do not follow any path-component
// symlink. On Windows, hold ancestor directory handles without delete sharing
// and reject reparse points. The picker and initial open are still separate.
pub(crate) struct PinnedDirectory {
    pub(crate) path: PathBuf,
    #[cfg(target_os = "linux")]
    _directory: File,
    #[cfg(windows)]
    _ancestors: Vec<File>,
}

impl PinnedDirectory {
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        if !path.is_absolute() {
            return Err("An absolute directory is required".into());
        }
        #[cfg(target_os = "linux")]
        {
            use rustix::fs::{open, openat, Mode, OFlags};
            use std::os::fd::AsRawFd;
            use std::path::Component;

            let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
            let mut directory =
                open("/", flags, Mode::empty()).map_err(|error| error.to_string())?;
            for component in path.components() {
                match component {
                    Component::RootDir => {}
                    Component::Normal(name) => {
                        directory = openat(&directory, name, flags, Mode::empty())
                            .map_err(|error| error.to_string())?;
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
                    .map_err(|error| error.to_string())?;
                let metadata = directory.metadata().map_err(|error| error.to_string())?;
                if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
                    return Err("Redirected directory is not supported".into());
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
            let metadata = std::fs::symlink_metadata(path).map_err(|error| error.to_string())?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err("Invalid directory".into());
            }
            Ok(Self {
                path: path.to_path_buf(),
            })
        }
    }
}
