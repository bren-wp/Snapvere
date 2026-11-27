#!/usr/bin/env python3
# Snapvere by Brendigo
"""Local HTTP acceptance for both extracted root-level deployment archives."""
import base64
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

opener = urllib.request.build_opener(NoRedirect())

def request(url, method="GET", headers=None, data=None):
    try:
        response = opener.open(urllib.request.Request(url, data=data, headers=headers or {}, method=method), timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

def start(root, env, router=None):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    command = ["php", "-S", f"127.0.0.1:{port}", "-t", str(root)]
    if router:
        command.append(str(root / router))
    proc = subprocess.Popen(command, cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            if request(base + "/")[0] == 200:
                return proc, base
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.1)
    proc.terminate()
    proc.wait()
    raise RuntimeError("PHP fixture did not start")

def stop(proc):
    proc.terminate()
    proc.wait(timeout=10)

def extract(directory, name, target):
    with zipfile.ZipFile(directory / name) as z:
        names = z.namelist()
        assert "index.php" in names and ".htaccess" in names
        assert all(not Path(n).is_absolute() and ".." not in Path(n).parts for n in names)
        assert not any(n.endswith("/key") or n == "key" for n in names)
        z.extractall(target)

def main(directory):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        share = tmp / "share"
        update = tmp / "update"
        extract(directory, "snpv.re-English.zip", share)
        extract(directory, "update.snapvere.com-English.zip", update)
        env = dict(os.environ, SNAPVERE_SHARE_STORAGE=str(tmp / "private"))
        assert not (share / "setup.php").exists()
        proc, base = start(share, env, "index.php")
        try:
            api = base + "/api/v1/shares"
            assert request(api+"/grant", "POST", data=b"")[0] == 400
            origin = {"Origin":"http://tauri.localhost"}
            code, _, body = request(api+"/grant", "POST", origin, b"")
            assert code == 201
            grant = json.loads(body)["grant"]
            private = tmp / "private"
            original_key = (private / "key").read_bytes()
            # Simulate known expired data, a current share, unknown extra
            # content, malformed metadata and old/recent replay markers.
            now = int(time.time()*1000)
            fixture = b"retention fixture"
            def fixture_share(letter, expiry, extra=False, malformed=False):
                folder = private / (letter * 64)
                folder.mkdir(mode=0o700)
                (folder/"media").write_bytes(fixture)
                metadata = {"type":"image/png","size":len(fixture),"expiresAt":expiry,
                            "sha256":hashlib.sha256(fixture).hexdigest(),"grant":"1"*64,"revoke":"2"*64}
                (folder/"meta.json").write_text("invalid" if malformed else json.dumps(metadata))
                if extra:
                    (folder/"unknown").write_bytes(b"keep")
                return folder
            expired = fixture_share("a", now-1000)
            active = fixture_share("b", now+3600000)
            unknown = fixture_share("c", now-1000, extra=True)
            malformed = fixture_share("d", now-1000, malformed=True)
            old_marker=private/("used-"+"e"*64)
            current_marker=private/("used-"+"f"*64)
            old_marker.write_text(str(now-91000000))
            current_marker.write_text(str(now))
            for _ in range(3):
                assert request(api+"/grant", "POST", origin, b"")[0] == 201
            assert request(api+"/grant", "POST", origin, b"")[0] == 429
            assert not expired.exists() and not old_marker.exists()
            assert (active/"media").read_bytes()==fixture
            assert (unknown/"unknown").read_bytes()==b"keep"
            assert (malformed/"meta.json").read_text()=="invalid"
            assert current_marker.read_text()==str(now)
            assert (private/"key").read_bytes() == original_key
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=")
            headers = {"Authorization": "Bearer " + grant, "Content-Type": "image/png", "X-Share-TTL": "3600"}
            assert request(api, "POST", {**headers, "Authorization": "Bearer bad"}, png)[0] == 401
            assert request(api, "POST", headers, b"invalid")[0] == 415
            code, _, body = request(api, "POST", headers, png)
            assert code == 201
            result = json.loads(body)
            endpoint = api + "/" + result["url"].rsplit("/", 1)[1]
            assert request(api, "POST", headers, png)[0] == 409
            assert json.loads(request(api + "/recover", "POST", {"Authorization": "Bearer " + grant}, b"")[2]) == result
            assert json.loads(request(endpoint)[2])["sha256"] == hashlib.sha256(png).hexdigest()
            assert request(endpoint + "/media")[2] == png
            code, _, body = request(endpoint + "/media", headers={"Range": "bytes=0-7"})
            assert code == 206 and body == png[:8]
            assert request(endpoint, "DELETE", {"Authorization": "Bearer bad"})[0] == 404
            assert request(endpoint, "DELETE", {"Authorization": "Bearer " + result["revocation"]})[0] == 204
            assert request(endpoint)[0] == 404
            assert request(api + "/recover", "POST", {"Authorization": "Bearer " + grant}, b"")[0] == 404
        finally:
            stop(proc)
        proc, base = start(update, os.environ)
        try:
            manifest = json.loads(request(base + "/stable.json")[2])
            page = request(base + "/")[2].decode()
            assert manifest["product"] == "snapvere-installed-delta-v1"
            assert manifest["packages"] == []
            assert "No compatible update available" in page
            version = manifest["version"]
            for name in ["Snapvere-Setup.exe","Snapvere-Pro-Setup.exe","Snapvere-Portable.exe","Snapvere-Pro-Linux-x86_64.AppImage","Snapvere-Linux-amd64.deb","Snapvere-Pro-Update.exe"]:
                assert request(base + "/download.php?version=" + version + "&from=0.0.0&package=" + name)[0] == 404
        finally:
            stop(proc)
    print("Both deployment ZIPs passed local HTTP lifecycle acceptance")

if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
