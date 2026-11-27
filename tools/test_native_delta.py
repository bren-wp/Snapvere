#!/usr/bin/env python3
# Snapvere by Brendigo
"""Cross-language native staging acceptance; temporary fixtures only."""
import hashlib
from pathlib import Path
import random
import subprocess
import tempfile

from delta_patch import BLOCK, build

ROOT = Path(__file__).resolve().parents[1]
CARGO = ROOT / "apps/desktop/src-tauri"

def main():
    subprocess.run(["cargo", "build", "--locked", "--example", "delta_stage"], cwd=CARGO, check=True)
    import json
    import os
    metadata = json.loads(subprocess.check_output(
        ["cargo", "metadata", "--locked", "--no-deps", "--format-version", "1"], cwd=CARGO))
    executable = Path(metadata["target_directory"]) / "debug/examples" / ("delta_stage.exe" if os.name == "nt" else "delta_stage")
    with tempfile.TemporaryDirectory() as work:
        root = Path(work)
        base, new, patch, out = [root / n for n in ("base", "new", "delta", "stage")]
        rng = random.Random(127)
        original = rng.randbytes(BLOCK * 6)
        updated = original[:BLOCK * 2] + b"Y" * BLOCK + rng.randbytes(BLOCK) + original[BLOCK * 4:] + b"tail"
        base.write_bytes(original)
        new.write_bytes(updated)
        target, old, version = "windows-pro", "0.2.38", "0.2.39"
        build(base, new, patch, target, old, version)
        digest = hashlib.sha256(patch.read_bytes()).hexdigest()
        def run(output, expected_digest=digest, edition=target):
            return subprocess.run([str(executable), str(base), str(patch), str(output), edition, old, version, expected_digest],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        result = run(out)
        assert result.returncode == 0, result.stderr.decode(errors="replace")
        assert out.read_bytes() == updated
        assert run(out).returncode != 0
        assert out.read_bytes() == updated
        bad = root / "bad"
        assert run(bad, "0" * 64).returncode != 0 and not bad.exists()
        assert run(bad, edition="linux-pro").returncode != 0 and not bad.exists()
        raw = patch.read_bytes()
        patch.write_bytes(raw[:-1] + b"X")
        assert run(bad, hashlib.sha256(patch.read_bytes()).hexdigest()).returncode != 0 and not bad.exists()
        patch.write_bytes(raw)
        base.write_bytes(b"X" + original[1:])
        assert run(bad).returncode != 0 and not bad.exists()
        assert base.read_bytes() == b"X" + original[1:]
        assert new.read_bytes() == updated
        base.write_bytes(original)

        def workspace_command(workspace, action, *args, ok=True):
            result = subprocess.run(
                [str(executable), "workspace", action, str(workspace), *map(str, args)],
                capture_output=True, timeout=60)
            assert (result.returncode == 0) == ok, result.stderr.decode(errors="replace")
            return result.stdout.decode().strip()

        workspace = root / "transaction"
        workspace_command(workspace, "init")
        live = workspace / "installed.bin"
        live.write_bytes(original)
        gallery = workspace / "gallery.sqlite"
        gallery.write_bytes(b"untouched gallery")
        workspace_command(workspace, "prepare", patch, target, old, version, digest)
        assert workspace_command(workspace, "status") == "prepared"
        assert live.read_bytes() == original
        tx = workspace / "transaction"
        backup = tx / "previous.bin"
        assert backup.read_bytes() == original
        live.write_bytes(b"unexpected change")
        workspace_command(workspace, "apply", ok=False)
        assert live.read_bytes() == b"unexpected change"
        live.write_bytes(original)
        # Simulate interruption immediately after the activation rename.
        (tx / "candidate.bin").replace(live)
        assert workspace_command(workspace, "status") == "applied"
        assert workspace_command(workspace, "apply") == "applied"
        assert live.read_bytes() == updated
        backup.write_bytes(b"corrupted backup")
        workspace_command(workspace, "rollback", ok=False)
        assert live.read_bytes() == updated
        backup.write_bytes(original)
        assert workspace_command(workspace, "rollback") == "rolled-back"
        assert workspace_command(workspace, "rollback") == "rolled-back"
        assert live.read_bytes() == original and backup.read_bytes() == original
        assert gallery.read_bytes() == b"untouched gallery"
        workspace_command(workspace, "init", ok=False)
        second = root / "second"
        workspace_command(second, "init")
        (second / "installed.bin").write_bytes(original)
        workspace_command(second, "prepare", patch, target, old, version, digest)
        assert workspace_command(second, "apply") == "applied"
        assert (second / "installed.bin").read_bytes() == updated
        assert workspace_command(second, "rollback") == "rolled-back"
        assert (second / "installed.bin").read_bytes() == original
    print("Native Rust staging and isolated transaction tests passed")

if __name__ == "__main__":
    main()
