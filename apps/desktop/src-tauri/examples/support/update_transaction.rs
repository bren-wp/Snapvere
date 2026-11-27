//! Snapvere by Brendigo — isolated native transaction acceptance.
//! Only fixed filenames inside an explicitly initialized private workspace.
//! Never selects a real installed application, elevates, launches a process,
//! or updates package-manager state. The workspace parent and local journal
//! are trusted and must be protected from noncooperating writers.

use super::{checked_file, hash_file, invalid, stage, validate_header, Header, MAX_BYTES};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

const MARKER: &[u8] = b"snapvere-native-test-workspace-v1\n";
const LIVE: &str = "installed.bin";
const TRANSACTION: &str = "transaction";
const CANDIDATE: &str = "candidate.bin";
const BACKUP: &str = "previous.bin";

#[cfg(unix)]
fn create_private(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new().mode(0o700).create(path)
}

#[cfg(not(unix))]
fn create_private(path: &Path) -> io::Result<()> {
    fs::create_dir(path)
}

fn private_dir(path: &Path) -> io::Result<PathBuf> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_dir() {
        return Err(invalid("Expected a real workspace directory"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.mode() & 0o077 != 0 {
            return Err(invalid("Workspace must not allow group or other access"));
        }
    }
    // Windows requires an operator-controlled private ACL. This example
    // does not claim to verify the effective ACL or all reparse points.
    path.canonicalize()
}

#[cfg(unix)]
fn sync_dir(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_dir(_path: &Path) -> io::Result<()> {
    // File contents are flushed on Windows. Directory durability across
    // physical power loss is not established by this reference.
    Ok(())
}

fn write_new(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(data)?;
    file.sync_all()
}

fn initialize(path: &Path) -> io::Result<()> {
    create_private(path)?;
    write_new(&path.join("workspace.marker"), MARKER)?;
    write_new(&path.join("lock"), b"snapvere transaction lock\n")?;
    sync_dir(path)?;
    sync_dir(
        path.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new(".")),
    )
}

fn open_workspace(path: &Path) -> io::Result<(PathBuf, File)> {
    let root = private_dir(path)?;
    let mut marker = Vec::new();
    checked_file(&root.join("workspace.marker"))?
        .take(MARKER.len() as u64 + 1)
        .read_to_end(&mut marker)?;
    if marker != MARKER {
        return Err(invalid("Not an initialized update workspace"));
    }
    let lock_path = root.join("lock");
    if !fs::symlink_metadata(&lock_path)?.is_file() {
        return Err(invalid("Invalid workspace lock"));
    }
    let lock = OpenOptions::new().read(true).write(true).open(lock_path)?;
    lock.try_lock()
        .map_err(|_| invalid("Workspace is locked"))?;
    Ok((root, lock))
}

fn matches(path: &Path, size: u64, hash: &str) -> io::Result<bool> {
    let mut file = checked_file(path)?;
    let (actual_size, actual_hash) = hash_file(&mut file)?;
    Ok(actual_size == size && actual_hash == hash)
}

fn absent(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}

fn copy_checked(
    source: &Path,
    parent: &Path,
    size: u64,
    hash: &str,
) -> io::Result<tempfile::NamedTempFile> {
    let mut input = checked_file(source)?;
    let permissions = input.metadata()?.permissions();
    let mut output = tempfile::NamedTempFile::new_in(parent)?;
    let copied = io::copy(&mut (&mut input).take(MAX_BYTES + 1), &mut output)?;
    if copied != size || hash_file(output.as_file_mut())? != (size, hash.to_owned()) {
        return Err(invalid("Backup identity mismatch"));
    }
    output.as_file().set_permissions(permissions)?;
    output.as_file().sync_all()?;
    Ok(output)
}

fn as_arg(path: &Path) -> io::Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("Workspace path is not UTF-8"))
}

fn prepare(root: &Path, args: &[String]) -> io::Result<()> {
    let [patch, target, from, to, digest] = args else {
        return Err(invalid("Expected PATCH TARGET FROM TO TRUSTED_PATCH_SHA256"));
    };
    let tx = root.join(TRANSACTION);
    create_private(&tx)?;
    sync_dir(root)?;
    let live = root.join(LIVE);
    let candidate = tx.join(CANDIDATE);
    let header = stage(&[
        as_arg(&live)?,
        patch.clone(),
        as_arg(&candidate)?,
        target.clone(),
        from.clone(),
        to.clone(),
        digest.clone(),
    ])?;
    let backup = copy_checked(&live, &tx, header.base_size, &header.base_sha256)?;
    backup
        .persist_noclobber(tx.join(BACKUP))
        .map_err(|error| error.error)?;
    let file = OpenOptions::new().write(true).open(&candidate)?;
    file.set_permissions(fs::metadata(&live)?.permissions())?;
    file.sync_all()?;
    let journal = serde_json::to_vec(&header).map_err(|_| invalid("Invalid journal"))?;
    write_new(&tx.join("journal.json"), &journal)?;
    sync_dir(&tx)?;
    sync_dir(root)
}

fn read_journal(tx: &Path) -> io::Result<Header> {
    private_dir(tx)?;
    let mut raw = Vec::new();
    checked_file(&tx.join("journal.json"))?
        .take(4097)
        .read_to_end(&mut raw)?;
    if raw.len() > 4096 {
        return Err(invalid("Oversized journal"));
    }
    let header: Header = serde_json::from_slice(&raw).map_err(|_| invalid("Invalid journal"))?;
    validate_header(&header, &header.target, &header.from, &header.to)?;
    Ok(header)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Prepared,
    Applied,
    RolledBack,
}

impl State {
    fn label(self) -> &'static str {
        match self {
            Self::Prepared => "prepared",
            Self::Applied => "applied",
            Self::RolledBack => "rolled-back",
        }
    }
}

fn classify(root: &Path, tx: &Path, header: &Header) -> io::Result<State> {
    if !matches(&tx.join(BACKUP), header.base_size, &header.base_sha256)? {
        return Err(invalid("Previous version unavailable or corrupted"));
    }
    let live = root.join(LIVE);
    let old = matches(&live, header.base_size, &header.base_sha256)?;
    let new = matches(&live, header.new_size, &header.new_sha256)?;
    let candidate = tx.join(CANDIDATE);
    let missing = absent(&candidate)?;
    if old && !missing && matches(&candidate, header.new_size, &header.new_sha256)? {
        Ok(State::Prepared)
    } else if new && missing {
        Ok(State::Applied)
    } else if old && missing {
        Ok(State::RolledBack)
    } else {
        Err(invalid("Unknown transaction state; preserve all files"))
    }
}

fn transition(root: &Path, action: &str) -> io::Result<()> {
    let tx = root.join(TRANSACTION);
    let header = read_journal(&tx)?;
    let state = classify(root, &tx, &header)?;
    match (action, state) {
        ("status", _) | ("apply", State::Applied) | ("rollback", State::RolledBack) => {}
        ("apply", State::Prepared) => {
            fs::rename(tx.join(CANDIDATE), root.join(LIVE))?;
            sync_dir(&tx)?;
            sync_dir(root)?;
        }
        ("rollback", State::Applied) => {
            let restored = copy_checked(
                &tx.join(BACKUP),
                root,
                header.base_size,
                &header.base_sha256,
            )?;
            // Same-directory replacement; the independent backup is retained.
            restored
                .persist(root.join(LIVE))
                .map_err(|error| error.error)?;
            sync_dir(root)?;
        }
        _ => return Err(invalid("Invalid transaction transition")),
    }
    println!("{}", classify(root, &tx, &header)?.label());
    Ok(())
}

pub(super) fn run(args: &[String]) -> io::Result<()> {
    let [action, path, rest @ ..] = args else {
        return Err(invalid("Expected workspace ACTION ROOT"));
    };
    let path = Path::new(path);
    if action == "init" && rest.is_empty() {
        return initialize(path);
    }
    let (root, _lock) = open_workspace(path)?;
    match action.as_str() {
        "prepare" => prepare(&root, rest),
        "status" | "apply" | "rollback" if rest.is_empty() => transition(&root, action),
        _ => Err(invalid("Unknown workspace action")),
    }
}
