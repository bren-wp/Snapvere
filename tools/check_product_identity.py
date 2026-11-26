#!/usr/bin/env python3
# Snapvere by Brendigo
"""Keep competitor identifiers out of the product while preserving audit evidence."""

import re
import subprocess
from pathlib import Path

PATTERN = "|".join(("rv" + "geshot", "not" + "brec"))
EVIDENCE_FILES = ("SOURCE-PROVENANCE.md", "FEATURE-MATRIX.md")


def check(root: Path) -> list[str]:
    # These are exact root-level documentary paths, not a directory exclusion.
    # All tracked filenames, including evidence filenames, are still checked.
    exclusions = [f":(top,exclude,literal){path}" for path in EVIDENCE_FILES]
    result = subprocess.run(
        ["git", "grep", "-niE", PATTERN, "--", ".", *exclusions],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(f"Product identity scan failed: {result.stderr.strip()}")
    violations = result.stdout.splitlines()
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
    for raw in tracked.split(b"\0"):
        path = raw.decode("utf-8", errors="replace")
        if re.search(PATTERN, path, re.IGNORECASE):
            violations.append(f"Legacy identity in tracked path: {path}")
    return violations


if __name__ == "__main__":
    findings = check(Path(__file__).resolve().parents[1])
    if findings:
        raise SystemExit("Legacy product identity found:\n" + "\n".join(findings))
    print("Product identity verified; exact provenance evidence paths preserved.")
