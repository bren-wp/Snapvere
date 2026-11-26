#!/usr/bin/env python3
# Snapvere by Brendigo
import json
import subprocess
import tempfile
from pathlib import Path
from generate_update_manifest import PACKAGE_NAMES, write_manifest
from prepare_update_site import prepare

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    packages = root / "packages"
    packages.mkdir()
    for name in PACKAGE_NAMES:
        (packages / name).write_bytes(b"x" * 1000000)
    manifest = root / "manifest.json"
    write_manifest("0.2.39", manifest, packages)
    data = json.loads(manifest.read_text())
    assert len(data["packages"]) == 10
    out = root / "web"
    prepare(manifest, out)
    assert (out / "stable.json").read_bytes() == manifest.read_bytes()
    for name in ("catalog.php", "index.php", "download.php"):
        subprocess.run(["php", "-l", str(out / name)], check=True)
    subprocess.run(["php", "-r", """
require $argv[1];
$d=update_catalog($argv[2]);
if (!$d || count($d['packages'])!==10) exit(1);
if (update_destination($d,'0.2.39','Snapvere-Pro-Setup.exe') !== 'https://github.com/bren-wp/Snapvere/releases/download/v0.2.39/Snapvere-Pro-Setup.exe') exit(2);
foreach (['../evil.exe','https://evil.example/evil.exe', ['Snapvere-Setup.exe']] as $p) {
    if (update_destination($d,'0.2.39',$p)!==null) exit(3);
}
if (update_destination($d,'0.2.38','Snapvere-Setup.exe')!==null) exit(4);
""", str(out / "catalog.php"), str(out / "stable.json")], check=True)
    page = subprocess.check_output(["php", str(out / "index.php")], text=True)
    assert all(name in page for name in PACKAGE_NAMES)
    assert "Stable" in page or "STABLE" in page
    assert "SHA-256" in page
    print("Verified 10-package catalog, shared website branding and fixed-origin download routing")
