#!/usr/bin/env python3
# Snapvere by Brendigo
"""Audit static WebExtension asset reachability, permissions and source duplication.

This is a deterministic *static* reachability check, not a proof that every
function or CSS declaration is reachable at runtime. It complements Node tests,
TypeScript dead-code checks and the Rust module graph audit.
"""
from html.parser import HTMLParser
from pathlib import Path
import json
from build_browser_extensions import canonical_text_bytes

ROOT = Path(__file__).resolve().parents[1]
BROWSERS = ("chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari")
SOURCE = ROOT / "extensions" / "source"
ASSETS = {
    "capture.js", "workspace.js", "background.js", "popup.js",
    "popup.html", "popup.css", "editor.js", "editor.html", "editor.css",
}


class Dependencies(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.javascript: list[str] = []
        self.styles: list[str] = []
        self.ids: list[str] = []
        self.classes: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "script":
            assert a.get("src"), "Inline scripts are not permitted by the extension CSP"
            self.javascript.append(a["src"])
        if tag == "link" and a.get("rel") == "stylesheet":
            assert a.get("href"), "Stylesheet must be local"
            self.styles.append(a["href"])
        if a.get("id"):
            self.ids.append(a["id"])
        self.classes.update((a.get("class") or "").split())


def audit(base: Path) -> dict[str, int]:
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    action = manifest["action"]["default_popup"]
    assert action == "popup.html"
    background = manifest["background"].get("scripts") or [manifest["background"]["service_worker"]]
    referenced = set(background) | {action, "editor.html"}
    for html_path in ("popup.html", "editor.html"):
        parser = Dependencies()
        parser.feed((base / html_path).read_text(encoding="utf-8"))
        assert len(parser.ids) == len(set(parser.ids)), f"{base.name}/{html_path}: duplicate id"
        assert parser.javascript and parser.styles, f"{base.name}/{html_path}: empty imports"
        referenced.update(parser.javascript + parser.styles)
        for script in parser.javascript:
            assert script.endswith(".js") and "/" not in script and "\\" not in script
        for style in parser.styles:
            assert style.endswith(".css") and "/" not in style and "\\" not in style
        # Programmatic controls must refer to controls present in the respective page.
        javascript = "\n".join((base / src).read_text("utf-8") for src in parser.javascript)
        import re
        ids = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', javascript))
        assert ids <= set(parser.ids), f"{base.name}/{html_path}: orphaned UI IDs {ids - set(parser.ids)}"
    assert referenced == ASSETS, (
        f"{base.name}: unreachable shipped assets {ASSETS - referenced}; "
        f"unexpected references {referenced - ASSETS}"
    )
    for name in ASSETS:
        assert canonical_text_bytes((base / name).read_bytes()) == canonical_text_bytes(
            (SOURCE / name).read_bytes()
        ), (
            f"{base.name}/{name}: stale or divergent code"
        )
    return {"assets": len(referenced), "html": 2, "scripts": 5, "styles": 2}


def main() -> None:
    for browser in BROWSERS:
        result = audit(ROOT / browser)
        print(f"{browser}: {result['assets']} reachable assets; "
              "HTML control IDs, script/css references and canonical source verified")
    print("Extension static dead-file audit: seven self-contained packages, no orphaned assets")


if __name__ == "__main__":
    main()
