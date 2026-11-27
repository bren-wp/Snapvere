#!/usr/bin/env python3
# Snapvere by Brendigo
import json
from pathlib import Path
import random
import tempfile
import unittest

from delta_patch import BLOCK, build
from signed_delta import key_fingerprint, openssl, sign, verify_and_stage


class SignedDeltaTest(unittest.TestCase):
    def test_authenticated_staging_and_rejection(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            private = root / "private.pem"
            public = root / "public.pem"
            other_private = root / "other-private.pem"
            other_public = root / "other-public.pem"
            for secret, key in [(private, public), (other_private, other_public)]:
                openssl("genpkey", "-algorithm", "Ed25519", "-out", secret)
                openssl("pkey", "-in", secret, "-pubout", "-out", key)
            pin = key_fingerprint(public)
            self.assertNotEqual(pin, key_fingerprint(other_public))
            base, new, patch, descriptor, sig = (root / name for name in ("base", "new", "update", "manifest", "signature"))
            original = random.Random(37).randbytes(BLOCK * 4)
            updated = original[:BLOCK * 2] + b"Y" * BLOCK + original[BLOCK * 3:]
            base.write_bytes(original)
            new.write_bytes(updated)
            args = ("windows-pro", "0.2.38", "0.2.39")
            build(base, new, patch, *args)
            with self.assertRaises(ValueError):
                sign(patch, other_private, descriptor, sig, pin)
            self.assertFalse(descriptor.exists())
            self.assertFalse(sig.exists())
            sign(patch, private, descriptor, sig, pin)
            output = root / "staged"
            verify_and_stage(base, patch, descriptor, sig, public, pin, output, *args)
            self.assertEqual(output.read_bytes(), updated)
            self.assertEqual(base.read_bytes(), original)
            with self.assertRaises(FileExistsError):
                verify_and_stage(base, patch, descriptor, sig, public, pin, output, *args)
            bad = root / "bad-output"
            for key, fingerprint in [(other_public, pin), (public, key_fingerprint(other_public))]:
                with self.assertRaises(ValueError):
                    verify_and_stage(base, patch, descriptor, sig, key, fingerprint, bad, *args)
                self.assertFalse(bad.exists())
            # Even a correctly pinned but different signer cannot use this signature.
            with self.assertRaises(ValueError):
                verify_and_stage(base, patch, descriptor, sig, other_public, key_fingerprint(other_public), bad, *args)
            with self.assertRaises(ValueError):
                verify_and_stage(base, patch, descriptor, sig, public, pin, bad, "linux-pro", *args[1:])
            for path, replacement in [(sig, b"X" * 64), (descriptor, descriptor.read_bytes() + b"\n"),
                                      (patch, bytes([patch.read_bytes()[0] ^ 1]) + patch.read_bytes()[1:])]:
                saved = path.read_bytes()
                path.write_bytes(replacement)
                try:
                    with self.assertRaises(ValueError):
                        verify_and_stage(base, patch, descriptor, sig, public, pin, bad, *args)
                    self.assertFalse(bad.exists())
                finally:
                    path.write_bytes(saved)
            changed = json.loads(descriptor.read_bytes())
            changed["delta"]["new_sha256"] = "0" * 64
            descriptor.write_text(json.dumps(changed, sort_keys=True, separators=(",", ":")))
            with self.assertRaises(ValueError):
                verify_and_stage(base, patch, descriptor, sig, public, pin, bad, *args)
            self.assertFalse(bad.exists())
            self.assertEqual(base.read_bytes(), original)
            self.assertEqual(output.read_bytes(), updated)

if __name__ == "__main__":
    unittest.main()
