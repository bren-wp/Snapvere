#!/usr/bin/env python3
# Snapvere by Brendigo
"""Offline deterministic tests for the Snapvere UI comparison gate."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_ui_references import compare, audit, REQUIRED


class ReferenceCompareTests(unittest.TestCase):
    def test_identical_is_exact(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            a = root / "actual.png"
            b = root / "approved.png"
            Image.new("RGB", (3, 2), (12, 35, 99)).save(a)
            Image.new("RGB", (3, 2), (12, 35, 99)).save(b)
            r = compare(a, b, root / "diff", 16)
            self.assertEqual(r["status"], "match")
            self.assertEqual(r["changed_pixels"], 0)

    def test_small_differences_are_not_certified_as_exact(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            a = root / "a.png"
            b = root / "b.png"
            Image.new("RGB", (2, 2), (0, 0, 0)).save(a)
            Image.new("RGB", (2, 2), (1, 0, 0)).save(b)
            r = compare(a, b, root / "diff", 16)
            self.assertEqual(r["status"], "diff")
            self.assertEqual(r["changed_pixels"], 4)
            self.assertEqual(r["significant_pixels"], 0)

    def test_dimensions_fail(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            a, b = root / "a.png", root / "b.png"
            Image.new("RGB", (2, 2)).save(a)
            Image.new("RGB", (3, 2)).save(b)
            self.assertEqual(compare(a, b, root / "diff", 16)["status"], "dimension_mismatch")

    def test_missing_references_fail_closed(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            actual, reference = root / "actual", root / "approved"
            actual.mkdir()
            reference.mkdir()
            for filename in REQUIRED:
                Image.new("RGB", (2, 2)).save(actual / filename)
            row = audit(actual, reference, root / "report", 16, False)
            self.assertFalse(row["exact_reference_match_for_supplied_previews"])
            self.assertTrue(all(
                x["status"] == "missing_approved_reference" for x in row["comparisons"]
            ))

    def test_inventory_never_certifies_approved_reference(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            actual = root / "actual"
            actual.mkdir()
            for filename in REQUIRED:
                Image.new("RGB", (2, 2)).save(actual / filename)
            row = audit(actual, None, root / "report", 16, True)
            self.assertFalse(row["exact_reference_match_for_supplied_previews"])
            self.assertEqual(row["missing_required_previews"], [])


if __name__ == "__main__":
    unittest.main()
