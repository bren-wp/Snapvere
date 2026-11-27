#!/usr/bin/env python3
# Snapvere by Brendigo
import tempfile
import unittest
from pathlib import Path

from audit_semantic_clones import analyze, python_signatures


class CloneAuditTest(unittest.TestCase):
    def test_renamed_python_functions_are_candidates(self):
        template = """def {fn}({arg}):
    result = []
    for index in range(20):
        if {arg}[index] > 4:
            result.append({arg}[index] * 2)
        else:
            result.append({arg}[index] + 8)
    if len(result) > 5:
        return result[:4]
    return result
"""
        first = template.format(fn="process", arg="data")
        second = template.format(fn="convert", arg="items")
        self.assertEqual(list(python_signatures(first)), list(python_signatures(second)))
        self.assertNotEqual(list(python_signatures(first)), list(python_signatures(second.replace("+ 8", "- 8"))))
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            (root / "tools").mkdir()
            paths = [root / "tools" / name for name in ("one.py", "two.py")]
            paths[0].write_text(first)
            paths[1].write_text(second)
            report = analyze(root, paths)
            self.assertEqual(report["candidate_count"], 1)
            self.assertEqual(report["scanned"], {".py": 2})


if __name__ == "__main__":
    unittest.main()
