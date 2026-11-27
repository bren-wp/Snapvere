#!/usr/bin/env python3
# Snapvere by Brendigo
import json
import hashlib
import subprocess
import tempfile
from pathlib import Path
from prepare_update_site import prepare

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    manifest=root/"manifest.json"
    data={"product":"snapvere-installed-delta-v1","channel":"stable","version":"0.2.39","packages":[]}
    manifest.write_text(json.dumps(data))
    out=root/"web";prepare(manifest,out)
    assert (out/"stable.json").read_bytes()==manifest.read_bytes()
    for name in ("catalog.php","index.php","download.php"):
        subprocess.run(["php","-l",str(out/name)],check=True)
    page=subprocess.check_output(["php",str(out/"index.php")],text=True)
    assert "No compatible update available" in page and "Snapvere-Setup.exe" not in page and "Download update</a>" not in page
    payload=b"test-only delta fixture"
    name="Snapvere-Pro-Update.exe"
    source=root/"patches/0.2.39/0.2.38"/name
    source.parent.mkdir(parents=True);source.write_bytes(payload)
    data["packages"]=[{"name":name,"kind":"delta","from":"0.2.38","size":len(payload),"sha256":hashlib.sha256(payload).hexdigest()}]
    manifest.write_text(json.dumps(data))
    verified=root/"verified";prepare(manifest,verified,root/"patches")
    subprocess.run(["php","-r", """
require $argv[1];
$d=update_catalog($argv[2]);
if (!$d || count($d['packages'])!==1) exit(1);
$p=update_entry($d,'0.2.39','0.2.38','Snapvere-Pro-Update.exe');
if (!$p || !update_present($d,$p)) exit(2);
foreach (['../bad','Snapvere-Portable.exe','Snapvere-Pro-Setup.exe','Snapvere-Linux-x86_64.AppImage'] as $name)
 if (update_entry($d,'0.2.39','0.2.38',$name)!==null) exit(3);
if (update_entry($d,'0.2.39','0.2.37','Snapvere-Pro-Update.exe')!==null) exit(4);
""",str(verified/"catalog.php"),str(verified/"stable.json")],check=True)
    data["packages"][0]["name"]="Snapvere-Pro-Setup.exe"
    manifest.write_text(json.dumps(data))
    try: prepare(manifest,root/"invalid",root/"patches")
    except ValueError: pass
    else: raise AssertionError("Full installer accepted as delta")
    print("Verified update-only catalog and exact base/edition isolation; test delta is not a production updater")
