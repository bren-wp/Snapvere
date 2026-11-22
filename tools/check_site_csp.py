#!/usr/bin/env python3
# Snapvere by Brendigo
"""Fail closed if hosting CSP drifts or an inline script changes without a reviewed SHA-256."""
import base64
import hashlib
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
HEADER = next(line.split(":", 1)[1].strip() for line in
              (SITE / "_headers").read_text("utf-8").splitlines()
              if line.strip().startswith("Content-Security-Policy:"))
CONFIG = tomllib.loads((ROOT / "netlify.toml").read_text("utf-8"))
NETLIFY = next(item["values"]["Content-Security-Policy"] for item in CONFIG["headers"]
               if item["for"] == "/*")
assert HEADER == NETLIFY, "Netlify and static hosting CSP must be identical"

directives = {}
for item in HEADER.split(";"):
    item = item.strip()
    if not item:
        continue
    name, *values = item.split()
    assert name not in directives, f"Duplicate CSP directive: {name}"
    directives[name] = values

for name, required in {
    "default-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "form-action": ["'self'"],
    "font-src": ["'self'"],
    "frame-src": ["'none'"],
    "worker-src": ["'none'"],
}.items():
    assert directives.get(name) == required, f"Unsafe or missing {name}"

scripts = directives["script-src"]
assert "'self'" in scripts
assert "'unsafe-inline'" not in scripts and "'unsafe-eval'" not in scripts
assert scripts.count("https://www.googletagmanager.com") == 1
assert set(directives["connect-src"]) == {
    "'self'", "https://www.google-analytics.com", "https://region1.google-analytics.com",
}, "No broad external network access"
assert directives.get("upgrade-insecure-requests") == [], "Require secure subresources"
assert "'unsafe-inline'" in directives["style-src"], (
    "Current site has design-only inline style attributes; isolate style exception from scripts"
)

inline_sources = {}
for page in sorted(SITE.rglob("*.html")):
    html = page.read_text(encoding="utf-8")
    for match in re.finditer(r"<script\\b([^>]*)>(.*?)</script>", html, re.IGNORECASE | re.DOTALL):
        attrs, body = match.groups()
        if re.search(r"\\bsrc\\s*=", attrs, re.IGNORECASE):
            continue
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
        token = "'sha256-" + digest + "'"
        assert token in scripts, f"Unhashed inline script in {page.relative_to(ROOT)}"
        inline_sources.setdefault(token, []).append(str(page.relative_to(ROOT)))

assert len(inline_sources) == 3, (
    f"Expected FAQ JSON-LD, application JSON-LD and common site bootstrap: {inline_sources}"
)
for token in scripts:
    if token.startswith("'sha256-"):
        assert token in inline_sources, f"Stale CSP hash: {token}"
print(f"Site CSP verified across both hosts: {len(inline_sources)} SHA-256 hashes")
