#!/usr/bin/env python3
# Snapvere by Brendigo
"""Verify the Rust authentication tool against OpenSSL-generated signatures."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = b"Snapvere signed delta v1\n"


def main():
    executable = Path(sys.argv[1]).resolve(strict=True)
    with tempfile.TemporaryDirectory() as work:
        root = Path(work)
        private, public, desc, sig = (root / n for n in ("private.pem", "public.der", "descriptor.json", "signature.bin"))
        message = root / "message"
        subprocess.run(["openssl", "genpkey", "-algorithm", "Ed25519", "-out", str(private)], check=True)
        subprocess.run(["openssl", "pkey", "-in", str(private), "-pubout", "-outform", "DER", "-out", str(public)], check=True)
        raw = json.dumps({
            "schema": "snapvere-signed-delta-v1",
            "patch_size": 1200, "patch_sha256": "a" * 64,
            "delta": {"target": "windows-pro", "from": "0.2.38", "to": "0.2.39",
                      "base_size": 65536, "new_size": 65536, "base_sha256": "b" * 64,
                      "new_sha256": "c" * 64}
        }, sort_keys=True, separators=(",", ":")).encode("ascii")
        desc.write_bytes(raw)
        message.write_bytes(DOMAIN + raw)
        subprocess.run(["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", str(private),
                        "-in", str(message), "-out", str(sig)], check=True)
        pin = hashlib.sha256(public.read_bytes()).hexdigest()

        def run(fingerprint=pin, target="windows-pro", old="0.2.38"):
            return subprocess.run([str(executable), str(desc), str(sig), str(public),
                                   fingerprint, target, old, "0.2.39"],
                                  capture_output=True, timeout=30)

        valid = run()
        assert valid.returncode == 0, valid.stderr
        assert valid.stdout.decode().strip() == "a" * 64
        for result in (run("0" * 64), run(target="windows-free"), run(old="0.2.37")):
            assert result.returncode != 0 and not result.stdout
        desc.write_bytes(raw + b" ")
        assert run().returncode != 0
        desc.write_bytes(raw)
        sig.write_bytes(bytes(64))
        assert run().returncode != 0
        print("Native Ed25519 verification interoperates with OpenSSL; tampering and wrong identities rejected")


if __name__ == "__main__":
    main()
