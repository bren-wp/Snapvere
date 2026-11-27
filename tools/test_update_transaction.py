#!/usr/bin/env python3
# Snapvere by Brendigo
import os
from pathlib import Path
import random
import tempfile
import unittest

from delta_patch import BLOCK, build
from signed_delta import key_fingerprint, openssl, sign
from update_transaction import initialize, prepare, apply, rollback, status, LIVE, TRANSACTION, BACKUP, CANDIDATE


@unittest.skipUnless(os.name == "posix", "POSIX isolated reference only")
class TransactionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        self.workspace = initialize(root / "workspace")
        self.live = self.workspace / LIVE
        self.original = random.Random(18).randbytes(BLOCK * 4)
        self.updated = self.original[:BLOCK] + b"Y" * BLOCK + self.original[BLOCK * 2:]
        self.live.write_bytes(self.original)
        self.live.chmod(0o700)
        new, self.patch, self.descriptor, self.signature, private, self.public = [
            root / name for name in ("new", "delta", "descriptor", "signature", "private.pem", "public.pem")
        ]
        new.write_bytes(self.updated)
        openssl("genpkey", "-algorithm", "Ed25519", "-out", private)
        openssl("pkey", "-in", private, "-pubout", "-out", self.public)
        self.pin = key_fingerprint(self.public)
        self.target = ("linux-pro", "0.2.38", "0.2.39")
        build(self.live, new, self.patch, *self.target)
        sign(self.patch, private, self.descriptor, self.signature, self.pin)

    def prepare(self):
        return prepare(self.workspace, self.patch, self.descriptor, self.signature,
                       self.public, self.pin, *self.target)

    def test_apply_and_rollback_preserve_backup_and_user_files(self):
        unrelated = self.workspace / "gallery.sqlite"
        unrelated.write_bytes(b"untouched user data")
        self.assertEqual(status(self.workspace), "idle")
        self.prepare()
        self.assertEqual(status(self.workspace), "prepared")
        self.assertEqual(self.live.read_bytes(), self.original)
        backup = self.workspace / TRANSACTION / BACKUP
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(apply(self.workspace), "applied")
        self.assertEqual(apply(self.workspace), "applied")
        self.assertEqual(self.live.read_bytes(), self.updated)
        self.assertEqual(rollback(self.workspace), "rolled-back")
        self.assertEqual(rollback(self.workspace), "rolled-back")
        self.assertEqual(self.live.read_bytes(), self.original)
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(unrelated.read_bytes(), b"untouched user data")
        self.assertEqual(self.live.stat().st_mode & 0o777, 0o700)
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_interruption_after_atomic_replace_is_recognized(self):
        self.prepare()
        os.replace(self.workspace / TRANSACTION / CANDIDATE, self.live)
        self.assertEqual(status(self.workspace), "applied")
        self.assertEqual(rollback(self.workspace), "rolled-back")
        self.assertEqual(self.live.read_bytes(), self.original)

    def test_modified_live_or_backup_fail_closed(self):
        self.prepare()
        self.live.write_bytes(b"unrecognized")
        with self.assertRaises(ValueError):
            apply(self.workspace)
        self.assertEqual(self.live.read_bytes(), b"unrecognized")
        self.live.write_bytes(self.original)
        self.assertEqual(apply(self.workspace), "applied")
        backup = self.workspace / TRANSACTION / BACKUP
        backup.write_bytes(b"bad backup")
        with self.assertRaises(ValueError):
            rollback(self.workspace)
        self.assertEqual(self.live.read_bytes(), self.updated)
        self.assertEqual(backup.read_bytes(), b"bad backup")

    def test_bad_signature_preserves_live_and_interrupted_state(self):
        self.signature.write_bytes(b"X" * 64)
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertEqual(self.live.read_bytes(), self.original)
        self.assertTrue((self.workspace / TRANSACTION).is_dir())
        with self.assertRaises(FileNotFoundError):
            apply(self.workspace)

    def test_uninitialized_workspace_is_rejected(self):
        other = self.workspace.parent / "other"
        other.mkdir(mode=0o700)
        with self.assertRaises(FileNotFoundError):
            apply(other)


if __name__ == "__main__":
    unittest.main()
