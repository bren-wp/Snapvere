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
    # Production packager must refuse arbitrary payloads, even matching hashes.
    try: prepare(manifest,root/"blocked",root/"patches")
    except ValueError: pass
    else: raise AssertionError("Unsigned payload accepted")
    try: prepare(manifest,root/"blocked-empty-source")
    except ValueError: pass
    else: raise AssertionError("Nonempty production catalog accepted")
    # Exercise PHP catalog routing in a temporary fixture only.
    import shutil
    verified=root/"verified";shutil.copytree(out,verified)
    # The unsigned nonempty manifest must not be served even when files exist.
    (verified/"stable.json").write_bytes(manifest.read_bytes())
    subprocess.run(["php","-r","require $argv[1]; if (update_catalog($argv[2])!==null) exit(1);",
                    str(verified/"catalog.php"),str(verified/"stable.json")],check=True)
    from signed_delta import openssl, public_der
    private,public,message,signature=[root/n for n in ("key.pem","public.pem","message","signature")]
    openssl("genpkey","-algorithm","Ed25519","-out",private)
    openssl("pkey","-in",private,"-pubout","-out",public)
    pin=public_der(public)[-32:].hex()
    signed=manifest.read_text()
    message.write_bytes(b"Snapvere signed catalog v1\n"+signed.encode())
    sig=openssl("pkeyutl","-sign","-rawin","-inkey",private,"-in",message)
    (verified/"stable.json").write_text(json.dumps({"signed":signed,"signature":sig.hex()}))
    fixture=verified/"patches/0.2.39/0.2.38"/name
    fixture.parent.mkdir(parents=True);fixture.write_bytes(payload)
    subprocess.run(["php","-r", """
require $argv[1];
if (update_catalog($argv[2])!==null) exit(5);
$d=update_catalog($argv[2],$argv[3]);
if (!$d || count($d['packages'])!==1) exit(1);
$p=update_entry($d,'0.2.39','0.2.38','Snapvere-Pro-Update.exe');
if (!$p || !update_present($d,$p)) exit(2);
foreach (['../bad','Snapvere-Portable.exe','Snapvere-Pro-Setup.exe','Snapvere-Linux-x86_64.AppImage'] as $name)
 if (update_entry($d,'0.2.39','0.2.38',$name)!==null) exit(3);
if (update_entry($d,'0.2.39','0.2.37','Snapvere-Pro-Update.exe')!==null) exit(4);
""",str(verified/"catalog.php"),str(verified/"stable.json"),pin],check=True)
    data["packages"][0]["name"]="Snapvere-Pro-Setup.exe"
    manifest.write_text(json.dumps(data))
    try: prepare(manifest,root/"invalid",root/"patches")
    except ValueError: pass
    else: raise AssertionError("Full installer accepted as delta")
    print("Verified update-only catalog and exact base/edition isolation; test delta is not a production updater")
