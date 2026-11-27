#!/usr/bin/env python3
# Snapvere by Brendigo
"""Build and exercise genuine differential fixture packages for both editions."""
import os
from pathlib import Path
import random
import shutil
import subprocess
import tempfile

from delta_patch import BLOCK
from signed_delta import openssl, key_fingerprint
from build_signed_update import package, NAMES

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "tools/native-updater"


def main():
    if os.name == "nt" and shutil.which("openssl") is None:
        git = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Git/usr/bin"
        os.environ["PATH"] = str(git) + os.pathsep + os.environ["PATH"]
    with tempfile.TemporaryDirectory() as work:
        root = Path(work)
        private, public = root / "private.pem", root / "public.pem"
        openssl("genpkey", "-algorithm", "Ed25519", "-out", private)
        openssl("pkey", "-in", private, "-pubout", "-out", public)
        pin = key_fingerprint(public)
        env = dict(os.environ, SNAPVERE_UPDATE_KEY_PIN=pin, CARGO_TARGET_DIR=str(root/"cargo"))
        subprocess.run(["cargo","build","--locked","--release"],cwd=PROJECT,env=env,check=True)
        runner = root/"cargo/release"/("snapvere-native-updater.exe" if os.name=="nt" else "snapvere-native-updater")
        platform = "windows" if os.name == "nt" else "linux"
        for edition in ("free","pro"):
            target = platform+"-"+edition
            folder=root/edition;folder.mkdir()
            base,new,out,staged = [folder/n for n in ("base.bin","target.bin",NAMES[target],"staged.bin")]
            rng=random.Random(310 if edition=="free" else 311)
            original=rng.randbytes(BLOCK*128)
            updated=original[:BLOCK*4]+b"R"*BLOCK+original[BLOCK*5:]
            base.write_bytes(original);new.write_bytes(updated)
            package(base,new,out,target,"0.2.38","0.2.39",private,public,pin,runner if os.name=="nt" else None)
            assert out.stat().st_size < new.stat().st_size
            def run(dest, selected=target):
                prefix=[str(out)] if os.name=="nt" else [str(runner),str(out)]
                return subprocess.run(prefix+[str(base),str(dest),selected,"0.2.38","0.2.39"],capture_output=True,timeout=60)
            result=run(staged)
            assert result.returncode==0,result.stderr
            assert staged.read_bytes()==updated
            assert run(staged).returncode!=0
            failed=folder/"failed"
            other=platform+("-pro" if edition=="free" else "-free")
            assert run(failed,other).returncode!=0
            base.write_bytes(b"X"+original[1:])
            assert run(failed).returncode!=0
            assert not failed.exists()
            base.write_bytes(original)
            assert new.read_bytes()==updated
        print("Signed native Free/Pro differential package fixtures passed; no production artifacts published")


if __name__=="__main__":
    main()
