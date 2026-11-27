//! Snapvere by Brendigo — isolated native authentication utility.
//! No network, process launch, installation or embedded production key.
//! The operator must supply an independently trusted public-key fingerprint.
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

const DOMAIN: &[u8] = b"Snapvere signed delta v1\n";
const DER_PREFIX: &[u8] = &[
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];
const MAX_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Delta {
    target: String,
    from: String,
    to: String,
    base_size: u64,
    new_size: u64,
    base_sha256: String,
    new_sha256: String,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Descriptor {
    schema: String,
    patch_size: u64,
    patch_sha256: String,
    delta: Delta,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn digest_valid(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn version(value: &str) -> Option<[u32; 3]> {
    let mut parts = value.split('.');
    let mut result = [0; 3];
    for slot in &mut result {
        let p = parts.next()?;
        if p.is_empty()
            || p.len() > 6
            || (p.len() > 1 && p.starts_with('0'))
            || !p.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        *slot = p.parse().ok()?;
    }
    parts.next().is_none().then_some(result)
}

fn read_bounded(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > limit {
        return Err(invalid("Expected a bounded regular file"));
    }
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(invalid("Input must be a regular file"));
    }
    let mut data = Vec::new();
    file.take(limit + 1).read_to_end(&mut data)?;
    if data.is_empty() || data.len() as u64 > limit {
        return Err(invalid("Input exceeds size limit"));
    }
    Ok(data)
}

fn authenticate(
    raw: &[u8],
    signature: &[u8],
    der: &[u8],
    fingerprint: &str,
    target: &str,
    from: &str,
    to: &str,
) -> io::Result<Descriptor> {
    if raw.is_empty() || raw.len() > 8192 || der.len() != 44 || !der.starts_with(DER_PREFIX) {
        return Err(invalid("Invalid signed metadata or public key"));
    }
    if !digest_valid(fingerprint) || format!("{:x}", Sha256::digest(der)) != fingerprint {
        return Err(invalid("Untrusted update key"));
    }
    let key_bytes: [u8; 32] = der[DER_PREFIX.len()..]
        .try_into()
        .map_err(|_| invalid("Invalid key length"))?;
    let key = VerifyingKey::from_bytes(&key_bytes).map_err(|_| invalid("Invalid Ed25519 key"))?;
    let signature = Signature::from_slice(signature).map_err(|_| invalid("Invalid signature"))?;
    let mut message = Vec::with_capacity(DOMAIN.len() + raw.len());
    message.extend_from_slice(DOMAIN);
    message.extend_from_slice(raw);
    key.verify_strict(&message, &signature)
        .map_err(|_| invalid("Signature verification failed"))?;
    let descriptor: Descriptor =
        serde_json::from_slice(raw).map_err(|_| invalid("Invalid signed descriptor"))?;
    let d = &descriptor.delta;
    let valid_versions = matches!((version(from), version(to)), (Some(a), Some(b)) if a < b);
    if descriptor.schema != "snapvere-signed-delta-v1"
        || !["windows-free", "windows-pro", "linux-free", "linux-pro"].contains(&target)
        || d.target != target
        || d.from != from
        || d.to != to
        || !valid_versions
        || !(1..=MAX_BYTES).contains(&d.base_size)
        || !(1..=MAX_BYTES).contains(&d.new_size)
        || !(1..d.new_size).contains(&descriptor.patch_size)
        || !digest_valid(&descriptor.patch_sha256)
        || !digest_valid(&d.base_sha256)
        || !digest_valid(&d.new_sha256)
    {
        return Err(invalid("Signed update identity or size mismatch"));
    }
    Ok(descriptor)
}

fn verify(args: &[String]) -> io::Result<()> {
    let [descriptor, signature, der, fingerprint, target, from, to] = args else {
        return Err(invalid(
            "Usage: snapvere-native-update-auth DESCRIPTOR SIGNATURE PUBLIC_DER TRUSTED_FINGERPRINT TARGET FROM TO",
        ));
    };
    let descriptor = authenticate(
        &read_bounded(Path::new(descriptor), 8192)?,
        &read_bounded(Path::new(signature), 64)?,
        &read_bounded(Path::new(der), 44)?,
        fingerprint,
        target,
        from,
        to,
    )?;
    // Only the authenticated patch hash is emitted, for the offline staging
    // utility. The caller must not substitute a hash from an unsigned source.
    println!("{}", descriptor.patch_sha256);
    Ok(())
}

fn main() -> io::Result<()> {
    verify(&std::env::args().skip(1).collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn exact_signature_and_identity() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let mut der = DER_PREFIX.to_vec();
        der.extend_from_slice(key.verifying_key().as_bytes());
        let fingerprint = format!("{:x}", Sha256::digest(&der));
        let raw = serde_json::to_vec(&serde_json::json!({
            "schema": "snapvere-signed-delta-v1",
            "patch_size": 1024,
            "patch_sha256": "a".repeat(64),
            "delta": {
                "target": "windows-pro", "from": "0.2.38", "to": "0.2.39",
                "base_size": 65536, "new_size": 65536,
                "base_sha256": "b".repeat(64), "new_sha256": "c".repeat(64)
            }
        })).unwrap();
        let mut msg = DOMAIN.to_vec();
        msg.extend_from_slice(&raw);
        let sig = key.sign(&msg).to_bytes();
        let check = |data: &[u8], signature: &[u8], pin: &str, target: &str, from: &str| {
            authenticate(data, signature, &der, pin, target, from, "0.2.39")
        };
        assert_eq!(
            check(&raw, &sig, &fingerprint, "windows-pro", "0.2.38")
                .unwrap()
                .patch_sha256,
            "a".repeat(64)
        );
        let mut altered = raw.clone();
        altered.push(b' ');
        assert!(check(&altered, &sig, &fingerprint, "windows-pro", "0.2.38").is_err());
        assert!(check(&raw, &[0; 64], &fingerprint, "windows-pro", "0.2.38").is_err());
        assert!(check(&raw, &sig, &"0".repeat(64), "windows-pro", "0.2.38").is_err());
        assert!(check(&raw, &sig, &fingerprint, "linux-pro", "0.2.38").is_err());
        assert!(check(&raw, &sig, &fingerprint, "windows-pro", "0.2.37").is_err());
    }
}
