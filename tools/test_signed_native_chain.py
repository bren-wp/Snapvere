#!/usr/bin/env python3
# Snapvere by Brendigo
"""Linux CI acceptance joining the native verifier and native delta stager.

The inputs and signing key are temporary fixtures. This test never executes
the reconstructed binary and never targets an installed application.
"""
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import tempfile

from delta_patch import BLOCK, build
from signed_delta import openssl, sign, key_fingerprint, public_der

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps/desktop/src-tauri"
AUTH = ROOT / "tools/native-update-auth"


def binary(project, name, example=False):
    args = ["cargo", "build", "--locked"]
    if example:
        args += ["--example", name]
    subprocess.run(args, cwd=project, check=True)
    metadata = json.loads(subprocess.check_output(
        ["cargo", "metadata", "--locked", "--no-deps", "--format-version", "1"],
        cwd=project))
    directory = Path(metadata["target_directory"]) / "debug"
    if example:
        directory /= "examples"
    return directory / (name + (".exe" if os.name == "nt" else ""))


def main():
    verifier = binary(AUTH, "snapvere-native-update-auth")
    stager = binary(DESKTOP, "delta_stage", example=True)
    with tempfile.TemporaryDirectory(prefix="snapvere-native-chain-") as work:
        root = Path(work)
        base, new, patch, descriptor, signature, private, public, der, output = [
            root / name for name in ("installed.bin", "target.bin", "patch", "descriptor",
                                     "signature", "private.pem", "public.pem", "public.der", "staged.bin")]
        rng = random.Random(907)
        original = rng.randbytes(BLOCK * 6)
        updated = original[:BLOCK * 2] + b"Y" * BLOCK + rng.randbytes(BLOCK) + original[BLOCK * 4:] + b"end"
        base.write_bytes(original)
        new.write_bytes(updated)
        gallery = root / "gallery.sqlite"
        gallery.write_bytes(b"untouched gallery fixture")
        target, old, version = "linux-pro", "0.2.38", "0.2.39"
        build(base, new, patch, target, old, version)
        openssl("genpkey", "-algorithm", "Ed25519", "-out", private)
        openssl("pkey", "-in", private, "-pubout", "-out", public)
        der.write_bytes(public_der(public))
        pin = key_fingerprint(public)
        signed = sign(patch, private, descriptor, signature, pin)
        original_descriptor = descriptor.read_bytes()
        original_signature = signature.read_bytes()
        original_patch = patch.read_bytes()

        def run(destination, fingerprint=pin, edition=target):
            verified = subprocess.run(
                [str(verifier), str(descriptor), str(signature), str(der), fingerprint, edition, old, version],
                capture_output=True, timeout=30)
            if verified.returncode != 0:
                assert not verified.stdout
                return "authentication-rejected"
            digest = verified.stdout.decode("ascii").strip()
            # Only the verifier output, never a downloaded manifest hash, is
            # passed into the native stager.
            assert len(digest) == 64 and all(c in "0123456789abcdef" for c in digest)
            result = subprocess.run(
                [str(stager), str(base), str(patch), str(destination), edition, old, version, digest],
                capture_output=True, timeout=60)
            return "staged" if result.returncode == 0 else "staging-rejected"

        assert len(original_patch) < len(updated)
        assert signed["patch_sha256"] == hashlib.sha256(original_patch).hexdigest()
        assert run(output) == "staged"
        assert output.read_bytes() == updated
        assert run(output) == "staging-rejected"
        assert output.read_bytes() == updated
        failed = root / "must-not-exist"
        assert run(failed, "0" * 64) == "authentication-rejected"
        assert run(failed, edition="linux-free") == "authentication-rejected"
        descriptor.write_bytes(original_descriptor + b" ")
        assert run(failed) == "authentication-rejected"
        descriptor.write_bytes(original_descriptor)
        signature.write_bytes(bytes(64))
        assert run(failed) == "authentication-rejected"
        signature.write_bytes(original_signature)
        patch.write_bytes(original_patch[:-1] + b"X")
        assert run(failed) == "staging-rejected"
        patch.write_bytes(original_patch)
        base.write_bytes(b"X" + original[1:])
        assert run(failed) == "staging-rejected"
        assert base.read_bytes() == b"X" + original[1:]
        base.write_bytes(original)
        assert not failed.exists()
        assert base.read_bytes() == original
        assert new.read_bytes() == updated
        assert gallery.read_bytes() == b"untouched gallery fixture"
        # Reuse the authenticated digest in an explicitly initialized native
        # transaction workspace. No installed path or executable is targeted.
        workspace = root / "transaction-workspace"
        def transaction(action, *args, ok=True):
            result = subprocess.run([str(stager), "workspace", action, str(workspace), *map(str,args)],
                                    capture_output=True, timeout=60)
            assert (result.returncode == 0) == ok, result.stderr.decode(errors="replace")
            return result.stdout.decode().strip()

        transaction("init")
        live = workspace / "installed.bin"
        live.write_bytes(original)
        live.chmod(0o700)
        unrelated = workspace / "gallery.sqlite"
        unrelated.write_bytes(b"preserve user data")
        verified = subprocess.check_output(
            [str(verifier), str(descriptor), str(signature), str(der), pin, target, old, version],
            timeout=30).decode("ascii").strip()
        transaction("prepare", patch, target, old, version, verified)
        assert transaction("status") == "prepared"
        assert live.read_bytes() == original
        backup = workspace / "transaction" / "previous.bin"
        assert backup.read_bytes() == original
        assert transaction("apply") == "applied"
        assert transaction("apply") == "applied"
        assert live.read_bytes() == updated
        assert transaction("rollback") == "rolled-back"
        assert transaction("rollback") == "rolled-back"
        assert live.read_bytes() == original
        assert backup.read_bytes() == original
        assert unrelated.read_bytes() == b"preserve user data"
        transaction("prepare", patch, target, old, version, verified, ok=False)
        print("Signed native delta chain passed: exact reconstruction, wrong key/edition, tampering, wrong base, no overwrite, isolated activation and rollback")


if __name__ == "__main__":
    main()
