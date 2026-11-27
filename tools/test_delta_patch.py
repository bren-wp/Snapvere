#!/usr/bin/env python3
# Snapvere by Brendigo
import hashlib
import random
import tempfile
import unittest
from pathlib import Path
from delta_patch import BLOCK, build, reconstruct

class DeltaTest(unittest.TestCase):
    def test_exact_base_and_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rng = random.Random(127)
            original = rng.randbytes(BLOCK * 6)
            changed = original[:BLOCK * 2] + b"Q" * BLOCK + original[BLOCK * 3:] + b"tail"
            old, new, patch, result = [root / n for n in ("old", "new", "update.svpatch", "stage")]
            old.write_bytes(original)
            new.write_bytes(changed)
            args = ("linux-pro", "0.2.38", "0.2.39")
            info = build(old, new, patch, *args)
            self.assertLess(info["patch_bytes"], len(changed))
            self.assertEqual(info["copied_bytes"], BLOCK * 5)
            reconstruct(old, patch, result, *args)
            self.assertEqual(result.read_bytes(), changed)
            self.assertEqual(info["new_sha256"], hashlib.sha256(changed).hexdigest())
            self.assertEqual(old.read_bytes(), original)
            with self.assertRaises(FileExistsError):
                reconstruct(old, patch, result, *args)
            self.assertEqual(result.read_bytes(), changed)
            wrong = root / "wrong"
            wrong.write_bytes(b"X" + original[1:])
            with self.assertRaises(ValueError):
                reconstruct(wrong, patch, root / "wrong-stage", *args)
            self.assertFalse((root / "wrong-stage").exists())
            for target, base, version in [("linux-free", "0.2.38", "0.2.39"), ("linux-pro", "0.2.37", "0.2.39"), ("linux-pro", "0.2.38", "0.2.40")]:
                with self.assertRaises(ValueError):
                    reconstruct(old, patch, root / "wrong-target", target, base, version)
            raw = patch.read_bytes()
            for corrupt in [raw[:-1], raw + b"extra", raw[:0] + b"BADMAGIC" + raw[8:], raw[:-2] + bytes([raw[-2] ^ 1]) + raw[-1:]]:
                bad = root / "bad"
                bad.write_bytes(corrupt)
                with self.assertRaises((ValueError, EOFError)):
                    reconstruct(old, bad, root / "bad-stage", *args)
                self.assertFalse((root / "bad-stage").exists())
            self.assertEqual(old.read_bytes(), original)
            self.assertEqual(new.read_bytes(), changed)
    def test_full_binary_fallback_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old, new, patch = [root / n for n in ("old", "new", "patch")]
            old.write_bytes(b"A" * BLOCK)
            new.write_bytes(b"B" * BLOCK)
            with self.assertRaises(ValueError):
                build(old, new, patch, "windows-pro", "0.2.38", "0.2.39")
            self.assertFalse(patch.exists())
            with self.assertRaises(ValueError):
                build(old, old, patch, "windows-pro", "0.2.38", "0.2.39")
    def test_raw_literal_and_shifted_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rng = random.Random(42)
            original = rng.randbytes(BLOCK * 4)
            changed = rng.randbytes(BLOCK) + original
            old, new, patch, result = [root / n for n in ("old","new","delta","stage")]
            old.write_bytes(original); new.write_bytes(changed)
            args = ("windows-free","1.0.0","1.0.1")
            build(old,new,patch,*args)
            reconstruct(old,patch,result,*args)
            self.assertEqual(result.read_bytes(),changed)

if __name__ == "__main__":
    unittest.main()
