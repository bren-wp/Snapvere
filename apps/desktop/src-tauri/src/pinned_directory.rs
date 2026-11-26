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
    /// Persist directory-entry changes on Linux before advancing the journal.
    /// Windows directory durability is not established by this method.
    pub(crate) fn sync_entries(&self) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        self._directory
            .sync_all()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub(crate) fn identity(&self) -> Result<String, String> {
        #[cfg(target_os = "linux")]
        {
            file_identity(&self._directory)
        }
        #[cfg(windows)]
        {
            file_identity(self._ancestors.last().ok_or("Missing directory handle")?)
        }
        #[cfg(not(any(target_os = "linux", windows)))]
        Err("Filesystem identity unsupported".into())
    }

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
            use std::fs::OpenOptions;
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

/// Open a registered local media file without following redirected ancestors or leaf links.
pub(crate) fn open_bounded_source(source: &Path, max: u64) -> Result<(File, u64), String> {
    let parent = PinnedDirectory::open(source.parent().ok_or("Missing source directory")?)?;
    let name = source.file_name().ok_or("Missing source filename")?;
    let source = parent.path.join(name);
    let mut options = std::fs::OpenOptions::new();
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
    let before = std::fs::symlink_metadata(&source).map_err(|error| error.to_string())?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err("Invalid or redirected gallery file".into());
    }
    let reader = options.open(&source).map_err(|error| error.to_string())?;
    let metadata = reader.metadata().map_err(|error| error.to_string())?;
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
            .map_err(|error| error.to_string())?;
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

/// Stable across rename/restart on the same filesystem; not an authenticity hash.
pub(crate) fn file_identity(file: &File) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::MetadataExt;
        let meta = file.metadata().map_err(|error| error.to_string())?;
        Ok(format!("linux:{:x}:{:x}", meta.dev(), meta.ino()))
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: the borrowed File keeps its handle live; info is writable.
        unsafe { GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info) }
            .map_err(|error| error.to_string())?;
        Ok(format!(
            "windows:{:x}:{:08x}{:08x}",
            info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow
        ))
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        let _ = file;
        Err("Filesystem identity unsupported".into())
    }
}
