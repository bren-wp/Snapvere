//! Snapvere by Brendigo — offline native delta staging.
//! This example never launches or replaces an installed application.
//! Its expected patch digest must come from an independently trusted,
//! verified descriptor; this program does not establish publisher trust.

use flate2::{Decompress, FlushDecompress, Status};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

const BLOCK: usize = 65_536;
pub(crate) const MAX_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Header {
    pub(crate) target: String,
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) base_size: u64,
    pub(crate) new_size: u64,
    pub(crate) base_sha256: String,
    pub(crate) new_sha256: String,
}

pub(crate) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn version(value: &str) -> Option<[u32; 3]> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut result = [0; 3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty()
            || part.len() > 6
            || (part.len() > 1 && part.starts_with('0'))
            || !part.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        result[i] = part.parse().ok()?;
    }
    Some(result)
}

pub(crate) fn checked_file(path: &Path) -> io::Result<File> {
    let info = fs::symlink_metadata(path)?;
    if !info.is_file() || info.len() == 0 || info.len() > MAX_BYTES {
        return Err(invalid("Expected a bounded regular file"));
    }
    let file = File::open(path)?;
    let opened = file.metadata()?;
    if !opened.is_file() || opened.len() != info.len() {
        return Err(invalid("Source changed"));
    }
    Ok(file)
}

pub(crate) fn hash_file(file: &mut File) -> io::Result<(u64, String)> {
    file.seek(SeekFrom::Start(0))?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0; BLOCK];
    let mut total = 0u64;
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > MAX_BYTES {
            return Err(invalid("Source exceeds limit"));
        }
        digest.update(&buffer[..n]);
    }
    file.seek(SeekFrom::Start(0))?;
    Ok((total, format!("{:x}", digest.finalize())))
}

fn read_u32(reader: &mut impl Read) -> io::Result<u32> {
    let mut raw = [0; 4];
    reader.read_exact(&mut raw)?;
    Ok(u32::from_be_bytes(raw))
}

fn read_u64(reader: &mut impl Read) -> io::Result<u64> {
    let mut raw = [0; 8];
    reader.read_exact(&mut raw)?;
    Ok(u64::from_be_bytes(raw))
}

pub(crate) fn read_header(reader: &mut impl Read) -> io::Result<Header> {
    let mut magic = [0; 8];
    reader.read_exact(&mut magic)?;
    if &magic != b"SVDELTA1" {
        return Err(invalid("Invalid delta magic"));
    }
    let length = read_u32(reader)? as usize;
    if !(1..=4096).contains(&length) {
        return Err(invalid("Invalid header length"));
    }
    let mut data = vec![0; length];
    reader.read_exact(&mut data)?;
    serde_json::from_slice(&data).map_err(|_| invalid("Invalid header"))
}

pub(crate) fn validate_header(header: &Header, target: &str, from: &str, to: &str) -> io::Result<()> {
    let allowed = ["windows-free", "windows-pro", "linux-free", "linux-pro"];
    let valid_versions = matches!((version(from), version(to)), (Some(a), Some(b)) if a < b);
    if !allowed.contains(&target)
        || header.target != target
        || header.from != from
        || header.to != to
        || !valid_versions
        || !(1..=MAX_BYTES).contains(&header.base_size)
        || !(1..=MAX_BYTES).contains(&header.new_size)
        || !valid_digest(&header.base_sha256)
        || !valid_digest(&header.new_sha256)
        || header.base_sha256 == header.new_sha256
    {
        return Err(invalid("Invalid delta identity"));
    }
    Ok(())
}

fn reconstruct(
    base: &mut File,
    delta: &mut File,
    output: &mut File,
    header: &Header,
) -> io::Result<()> {
    let mut remaining = header.new_size;
    let mut copied = false;
    let mut digest = Sha256::new();
    let mut block = vec![0; BLOCK + 1];
    let mut packed = vec![0; BLOCK];
    let mut op = [0; 1];
    while remaining > 0 {
        delta.read_exact(&mut op)?;
        let expected = remaining.min(BLOCK as u64) as usize;
        match op[0] {
            b'C' => {
                let offset = read_u64(delta)?;
                let length = read_u32(delta)? as usize;
                if length != expected
                    || !offset.is_multiple_of(BLOCK as u64)
                    || offset
                        .checked_add(length as u64)
                        .is_none_or(|end| end > header.base_size)
                {
                    return Err(invalid("Invalid copy range"));
                }
                base.seek(SeekFrom::Start(offset))?;
                base.read_exact(&mut block[..length])?;
                copied = true;
            }
            b'L' => {
                if read_u32(delta)? as usize != expected {
                    return Err(invalid("Invalid literal length"));
                }
                delta.read_exact(&mut block[..expected])?;
            }
            b'Z' => {
                let length = read_u32(delta)? as usize;
                let compressed = read_u32(delta)? as usize;
                if length != expected || compressed == 0 || compressed >= length {
                    return Err(invalid("Invalid compressed block"));
                }
                delta.read_exact(&mut packed[..compressed])?;
                let mut decoder = Decompress::new(true);
                let status = decoder
                    .decompress(
                        &packed[..compressed],
                        &mut block[..expected + 1],
                        FlushDecompress::Finish,
                    )
                    .map_err(|_| invalid("Corrupt compressed block"))?;
                if status != Status::StreamEnd
                    || decoder.total_in() != compressed as u64
                    || decoder.total_out() != expected as u64
                {
                    return Err(invalid("Invalid compressed block termination"));
                }
            }
            _ => return Err(invalid("Unknown delta operation")),
        }
        output.write_all(&block[..expected])?;
        digest.update(&block[..expected]);
        remaining -= expected as u64;
    }
    delta.read_exact(&mut op)?;
    if !copied || op[0] != b'E' || delta.read(&mut op)? != 0 {
        return Err(invalid("Invalid incremental delta termination"));
    }
    if format!("{:x}", digest.finalize()) != header.new_sha256 {
        return Err(invalid("Reconstructed hash mismatch"));
    }
    Ok(())
}

pub(crate) fn stage(args: &[String]) -> io::Result<Header> {
    let [base_path, patch_path, out_path, target, from, to, trusted_digest] = args else {
        return Err(invalid(
            "Usage: delta_stage BASE PATCH NEW_OUTPUT TARGET FROM TO TRUSTED_PATCH_SHA256",
        ));
    };
    if !valid_digest(trusted_digest) {
        return Err(invalid("Expected independently trusted patch SHA-256"));
    }
    let out = Path::new(out_path);
    // The operator must use an isolated staging directory under their control.
    // Snapshot the patch privately so the decoder only reads authenticated bytes.
    let parent = out
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut patch = checked_file(Path::new(patch_path))?;
    let mut snapshot = tempfile::tempfile_in(parent)?;
    let copied = io::copy(&mut (&mut patch).take(MAX_BYTES + 1), &mut snapshot)?;
    if copied == 0 || copied > MAX_BYTES {
        return Err(invalid("Invalid patch size"));
    }
    let (patch_size, digest) = hash_file(&mut snapshot)?;
    if &digest != trusted_digest {
        return Err(invalid("Untrusted patch digest"));
    }
    let header = read_header(&mut snapshot)?;
    validate_header(&header, target, from, to)?;
    if patch_size >= header.new_size {
        return Err(invalid("Full binaries are not differential updates"));
    }
    let mut base = checked_file(Path::new(base_path))?;
    let (size, digest) = hash_file(&mut base)?;
    if size != header.base_size || digest != header.base_sha256 {
        return Err(invalid("Wrong base binary"));
    }
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    reconstruct(&mut base, &mut snapshot, temporary.as_file_mut(), &header)?;
    let (size, digest) = hash_file(&mut base)?;
    if size != header.base_size || digest != header.base_sha256 {
        return Err(invalid("Base changed during staging"));
    }
    temporary.as_file().sync_all()?;
    // Never overwrite an existing output, including the base or patch.
    temporary.persist_noclobber(out).map_err(|e| e.error)?;
    Ok(header)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_and_hash_constraints() {
        assert_eq!(version("0.2.39"), Some([0, 2, 39]));
        for invalid_version in ["01.2.3", "1.2", "1.2.3.4", "1.2.+3", "1000000.1.1"] {
            assert!(version(invalid_version).is_none());
        }
        assert!(valid_digest(&"a".repeat(64)));
        assert!(!valid_digest(&"A".repeat(64)));
    }
}
