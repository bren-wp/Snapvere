//! Snapvere by Brendigo — signed offline differential package runner.
//! Reconstructs to a new file only. Activation and installer ownership
//! are deliberately not implemented. No network, elevation or process launch.
#[path = "../../../apps/desktop/src-tauri/examples/support/delta_codec.rs"]
mod delta_codec;

use delta_codec::{checked_file, invalid, read_header, stage, MAX_BYTES};
use snapvere_native_update_auth::authenticate;
use std::fs::File;
use std::io::{self, Read, Write};
#[cfg(windows)]
use std::io::{Seek, SeekFrom};
use std::path::Path;

const MAGIC: &[u8; 8] = b"SVUPKG01";
#[cfg(windows)]
const FOOTER: &[u8; 8] = b"SVUPEND1";
const MAX_BUNDLE: u64 = MAX_BYTES + 8192 + 120;

#[cfg(windows)]
fn bundle_input() -> io::Result<io::Take<File>> {
    let mut file = File::open(std::env::current_exe()?)?;
    let size = file.metadata()?.len();
    if size < 16 {
        return Err(invalid("Missing embedded update"));
    }
    file.seek(SeekFrom::End(-16))?;
    let mut footer = [0; 8];
    let mut length = [0; 8];
    file.read_exact(&mut footer)?;
    file.read_exact(&mut length)?;
    let length = u64::from_be_bytes(length);
    if &footer != FOOTER || length == 0 || length > MAX_BUNDLE || length >= size - 16 {
        return Err(invalid("Invalid embedded update"));
    }
    file.seek(SeekFrom::Start(size - 16 - length))?;
    Ok(file.take(length))
}

#[cfg(not(windows))]
fn bundle_input(path: &Path) -> io::Result<io::Take<File>> {
    let meta = std::fs::symlink_metadata(path)?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_BUNDLE {
        return Err(invalid("Invalid update bundle"));
    }
    Ok(File::open(path)?.take(meta.len()))
}

fn reconstruct_package(
    mut bundle: impl Read,
    base: &str,
    output: &str,
    target: &str,
    from: &str,
    to: &str,
) -> io::Result<()> {
    // A package cannot choose its own trust anchor. A release operator
    // must supply the independently reviewed pin at compile time.
    let pin = option_env!("SNAPVERE_UPDATE_KEY_PIN")
        .ok_or_else(|| invalid("Updater has no configured trust anchor"))?;
    let mut magic = [0; 8];
    let mut length = [0; 4];
    bundle.read_exact(&mut magic)?;
    bundle.read_exact(&mut length)?;
    let length = u32::from_be_bytes(length) as usize;
    if &magic != MAGIC || !(1..=8192).contains(&length) {
        return Err(invalid("Invalid update bundle"));
    }
    let mut descriptor = vec![0; length];
    let mut signature = [0; 64];
    let mut der = [0; 44];
    bundle.read_exact(&mut descriptor)?;
    bundle.read_exact(&mut signature)?;
    bundle.read_exact(&mut der)?;
    let signed = authenticate(&descriptor, &signature, &der, pin, target, from, to)?;
    let parent = Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let workspace = tempfile::tempdir_in(parent)?;
    let path = workspace.path().join("patch");
    let mut patch = File::create_new(&path)?;
    let written = io::copy(
        &mut (&mut bundle).take(signed.patch_size + 1),
        &mut patch,
    )?;
    if written != signed.patch_size {
        return Err(invalid("Incorrect signed patch length"));
    }
    patch.flush()?;
    patch.sync_all()?;
    drop(patch);
    let mut patch = checked_file(&path)?;
    let header = read_header(&mut patch)?;
    let expected = signed.delta;
    if header.target != expected.target
        || header.from != expected.from
        || header.to != expected.to
        || header.base_size != expected.base_size
        || header.new_size != expected.new_size
        || header.base_sha256 != expected.base_sha256
        || header.new_sha256 != expected.new_sha256
    {
        return Err(invalid("Signed descriptor and patch header disagree"));
    }
    drop(patch);
    let path = path
        .to_str()
        .ok_or_else(|| invalid("Staging path is not UTF-8"))?;
    stage(&[
        base.to_owned(),
        path.to_owned(),
        output.to_owned(),
        target.to_owned(),
        from.to_owned(),
        to.to_owned(),
        signed.patch_sha256,
    ])?;
    Ok(())
}

#[cfg(windows)]
fn run(args: &[String]) -> io::Result<()> {
    let [base, output, target, from, to] = args else {
        return Err(invalid("Usage: Update.exe BASE NEW_OUTPUT TARGET FROM TO"));
    };
    if !["windows-free", "windows-pro"].contains(&target.as_str()) {
        return Err(invalid("Incorrect Windows edition"));
    }
    reconstruct_package(bundle_input()?, base, output, target, from, to)
}

#[cfg(not(windows))]
fn run(args: &[String]) -> io::Result<()> {
    let [bundle, base, output, target, from, to] = args else {
        return Err(invalid("Usage: snapvere-native-updater BUNDLE BASE NEW_OUTPUT TARGET FROM TO"));
    };
    if !cfg!(target_os = "linux") || !["linux-free", "linux-pro"].contains(&target.as_str()) {
        return Err(invalid("Incorrect Linux edition"));
    }
    reconstruct_package(bundle_input(Path::new(bundle))?, base, output, target, from, to)
}

fn main() -> io::Result<()> {
    run(&std::env::args().skip(1).collect::<Vec<_>>())
}
