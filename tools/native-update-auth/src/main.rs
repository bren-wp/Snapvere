//! Snapvere by Brendigo — offline signed descriptor verification CLI.
use snapvere_native_update_auth::{authenticate, invalid, read_bounded};
use std::io;
use std::path::Path;

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

