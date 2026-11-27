#!/usr/bin/env python3
# Snapvere by Brendigo
"""Stage update-only website and explicitly verified local delta files."""
import argparse
import json
import shutil
from pathlib import Path
from generate_update_manifest import SEMVER
def valid_version(value):
    return isinstance(value,str) and SEMVER.fullmatch(value) and all(int(p)<=999999 for p in value.split("."))
def prepare(manifest:Path,out:Path,patches:Path|None=None)->None:
    if patches is not None: raise ValueError("Production patch staging is not enabled")
    raw=manifest.read_bytes()
    if len(raw)>8192: raise ValueError("Oversized manifest")
    data=json.loads(raw)
    packages=data.get("packages")
    version=data.get("version")
    if data.get("product")!="snapvere-installed-delta-v1" or data.get("channel")!="stable" or not valid_version(version) or not isinstance(packages,list) or len(packages)>4:
        raise ValueError("Expected update-only catalog")
    if packages:
        raise ValueError("Production delta publication is locked pending authenticated package acceptance")
    if out.exists(): raise ValueError("Choose a new staging directory")
    root=Path(__file__).resolve().parents[1]
    out.mkdir(parents=True)
    for name in ("index.php","download.php","catalog.php","updates.css",".htaccess"):
        shutil.copyfile(root/"deploy/update.snapvere.com"/name,out/name)
    for name in ("styles.css","favicon.svg","fonts/inter-latin.woff2"):
        target=out/name; target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/"site"/name,target)
    (out/"stable.json").write_bytes(raw)
if __name__=="__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest",type=Path,required=True)
    ap.add_argument("--out",type=Path,required=True)
    ap.add_argument("--patches",type=Path)
    args=ap.parse_args();prepare(args.manifest,args.out,args.patches)
