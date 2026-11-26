#!/usr/bin/env python3
# Snapvere by Brendigo
"""Run the actual release preflight Bash step against isolated API fixtures."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHA = "a" * 40
OTHER = "b" * 40
TAG = [{"ref": "refs/tags/v0.2.33"}]


def release(draft=True, target=SHA, preview=True):
    return dict(tag_name="v0.2.33", draft=draft, target_commitish=target,
                prerelease=preview)


class ReleasePreflightTest(unittest.TestCase):
    def test_release_decisions(self):
        workflow = (ROOT / ".github/workflows/release.yml").read_text()
        match = re.search(r"        id: plan\n[\s\S]*?        run: \|\n((?:          [^\n]*\n)+)", workflow)
        self.assertIsNotNone(match, "Release preflight step missing")
        script = textwrap.dedent(match.group(1))
        subprocess.run(["bash", "-n"], input=script, text=True, check=True)
        cases = [
            ("new release", [], [], SHA, SHA, "build=true"),
            ("published preview", [[release(False, OTHER)]], TAG, SHA, OTHER, "build=false"),
            ("same SHA draft", [[release()]], [], SHA, SHA, "build=true"),
            ("tagged draft", [[release()]], TAG, SHA, SHA, "build=true"),
            ("wrong draft target", [[release(target=OTHER)]], [], SHA, OTHER, None),
            ("orphan tag", [], TAG, SHA, SHA, None),
            ("wrong tagged draft", [[release()]], TAG, SHA, OTHER, None),
            ("duplicate releases", [[release()], [release()]], [], SHA, SHA, None),
            ("published stable", [[release(False, SHA, False)]], TAG, SHA, SHA, "build=false"),
            ("incorrect draft label", [[release(True, SHA, False)]], [], SHA, SHA, None),
            ("stale main", [], [], OTHER, SHA, "build=false"),
            ("published tag mismatch", [[release(False, OTHER)]], TAG, SHA, SHA, None),
            ("prefix tag", [], [{"ref": "refs/tags/v0.2.330"}], SHA, SHA, "build=true"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            app = root / "apps/desktop"
            (app / "src-tauri").mkdir(parents=True)
            for path in (app / "package.json", app / "src-tauri/tauri.conf.json"):
                path.write_text('{"version":"0.2.33"}')
            mocks = {
                "git": '#!/bin/sh\nprintf "%s\\n" "$GITHUB_SHA"\n',
                "gh": '''#!/bin/sh
case "$*" in
 *git/ref/heads/main*) echo "$MOCK_MAIN";;
 *releases?per_page=100*) echo "$MOCK_RELEASES";;
 *git/matching-refs/tags/*) echo "$MOCK_REFS";;
 *commits/v0.2.33*) echo "$MOCK_TAG_SHA";;
 *) exit 88;;
esac
''',
            }
            for name, body in mocks.items():
                path = bin_dir / name
                path.write_text(body)
                path.chmod(0o755)
            out = root / "output"
            for name, releases, refs, main, tag_sha, expected in cases:
                with self.subTest(name=name):
                    out.write_text("")
                    env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                               GITHUB_REF="refs/heads/main", GITHUB_SHA=SHA,
                               GITHUB_REPOSITORY="bren-wp/Snapvere", GITHUB_OUTPUT=str(out),
                               MOCK_MAIN=main, MOCK_RELEASES=json.dumps(releases),
                               MOCK_REFS=json.dumps(refs), MOCK_TAG_SHA=tag_sha)
                    result = subprocess.run(["bash"], input=script, cwd=root, env=env,
                                            text=True, capture_output=True)
                    if expected is None:
                        self.assertNotEqual(result.returncode, 0, result.stdout)
                        self.assertEqual(out.read_text(), "")
                    else:
                        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                        self.assertEqual(out.read_text().strip(), expected)


if __name__ == "__main__":
    unittest.main()
