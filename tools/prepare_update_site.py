#!/usr/bin/env python3
# Snapvere by Brendigo
"""Stage update-only website and explicitly verified local delta files."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from generate_update_manifest import SEMVER
PATCH_NAMES={"Snapvere-Update.exe","Snapvere-Pro-Update.exe","Snapvere-Linux-Update.svpatch","Snapvere-Pro-Linux-Update.svpatch"}
def valid_version(value):
    return isinstance(value,str) and SEMVER.fullmatch(value) and all(int(p)<=999999 for p in value.split("."))
def version_tuple(v):
    return tuple(map(int,v.split(".")))
def prepare(manifest:Path,out:Path,patches:Path|None=None)->None:
    raw=manifest.read_bytes()
    if len(raw)>8192: raise ValueError("Oversized manifest")
    data=json.loads(raw)
    packages=data.get("packages")
    version=data.get("version")
    if data.get("product")!="snapvere-installed-delta-v1" or data.get("channel")!="stable" or not valid_version(version) or not isinstance(packages,list) or len(packages)>4:
        raise ValueError("Expected update-only catalog")
    remaining=set(PATCH_NAMES)
    verified=[]
    for p in packages:
        if not isinstance(p,dict) or not isinstance(p.get("name"),str) or p["name"] not in remaining or p.get("kind")!="delta" or not valid_version(p.get("from")) or version_tuple(p["from"])>=version_tuple(version) or type(p.get("size")) is not int or not 1<=p["size"]<=536870912 or not isinstance(p.get("sha256"),str) or not re.fullmatch(r"[0-9a-f]{64}",p["sha256"]):
            raise ValueError("Invalid delta catalog entry")
        remaining.remove(p["name"])
        if patches is None: raise ValueError("Actual delta files required")
        relative=Path(version)/p["from"]/p["name"]
        source=patches/relative
        if source.is_symlink() or not source.is_file() or source.stat().st_size!=p["size"]: raise ValueError("Missing or invalid delta file")
        with source.open("rb") as f:
            if hashlib.file_digest(f,"sha256").hexdigest()!=p["sha256"]: raise ValueError("Delta digest mismatch")
        verified.append((relative,source))
    if out.exists(): raise ValueError("Choose a new staging directory")
    root=Path(__file__).resolve().parents[1]
    out.mkdir(parents=True)
    for name in ("index.php","download.php","catalog.php","updates.css",".htaccess"):
        shutil.copyfile(root/"deploy/update.snapvere.com"/name,out/name)
    for name in ("styles.css","favicon.svg","fonts/inter-latin.woff2"):
        target=out/name; target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/"site"/name,target)
    for relative,source in verified:
        target=out/"patches"/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    (out/"stable.json").write_bytes(raw)
if __name__=="__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest",type=Path,required=True)
    ap.add_argument("--out",type=Path,required=True)
    ap.add_argument("--patches",type=Path)
    args=ap.parse_args();prepare(args.manifest,args.out,args.patches)
