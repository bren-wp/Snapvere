#!/usr/bin/env python3
# Snapvere by Brendigo
"""Regression tests for the product/evidence identity boundary."""

import subprocess
import tempfile
import unittest
from pathlib import Path

from check_product_identity import EVIDENCE_FILES, check


class ProductIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.term = "rv" + "geshot"
        self.write("README.md", "Snapvere by Brendigo")

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        subprocess.run(["git", "add", "--", name], cwd=self.root, check=True)

    def test_exact_root_evidence_paths_are_preserved(self):
        for name in EVIDENCE_FILES:
            self.write(name, self.term + " provenance citation")
        self.assertEqual(check(self.root), [])

    def test_product_and_non_exempt_documentation_are_rejected(self):
        for name in ("site/index.html", "apps/desktop/src/main.ts", "docs/guide.md"):
            self.write(name, self.term.upper())
        findings = check(self.root)
        self.assertEqual(len(findings), 3)
        for name in ("site/index.html", "apps/desktop/src/main.ts", "docs/guide.md"):
            self.assertTrue(any(line.startswith(name + ":") for line in findings))

    def test_nested_evidence_name_does_not_exempt_product_content(self):
        self.write("site/" + EVIDENCE_FILES[0], self.term)
        self.assertEqual(len(check(self.root)), 1)

    def test_tracked_filename_is_checked_even_with_clean_content(self):
        self.write("assets/" + self.term + ".txt", "Snapvere")
        self.assertEqual(len(check(self.root)), 1)
        self.assertIn("tracked path", check(self.root)[0])

    def test_git_scan_error_does_not_pass(self):
        with tempfile.TemporaryDirectory() as outside:
            with self.assertRaises(RuntimeError):
                check(Path(outside))


if __name__ == "__main__":
    unittest.main()
