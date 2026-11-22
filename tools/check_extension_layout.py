#!/usr/bin/env python3
# Snapvere by Brendigo
"""Render extension HTML in Chromium at narrow/desktop widths and both OS themes.

This tests responsive DOM geometry and produces authentic HTML previews. It
does not assert native Chrome/Firefox/Safari extension API integration or 1:1
pixel parity without source reference screenshots.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/extension-layout-previews"
OUT.mkdir(parents=True, exist_ok=True)


def run() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for page_name in ("popup", "editor"):
            for theme in ("dark", "light"):
                for width in ((280, 320, 355, 376, 420) if page_name == "popup" else (320, 768, 1280)):
                    ctx = browser.new_context(
                        color_scheme=theme,
                        viewport={"width": width, "height": 860},
                        reduced_motion="reduce",
                    )
                    page = ctx.new_page()
                    page.goto((ROOT / "extensions" / "source" / f"{page_name}.html").as_uri())
                    page.wait_for_load_state("domcontentloaded")
                    # No JS screenshot shortcut replaces native browser capture
                    # acceptance; this is an HTML/theme/resize geometry guard.
                    geometry = page.evaluate("""() => ({
                        viewport: innerWidth,
                        body: document.body.getBoundingClientRect().width,
                        documentWidth: document.documentElement.scrollWidth,
                        buttons: [...document.querySelectorAll("button")]
                          .filter(button => button.getClientRects().length > 0)
                          .map(button => {
                            const r = button.getBoundingClientRect();
                            return {name: button.textContent.trim(), left: r.left,
                              right: r.right, width: r.width};
                          }),
                        bg: getComputedStyle(document.documentElement)
                            .getPropertyValue("--bg").trim(),
                    })""")
                    assert geometry["documentWidth"] <= width + 2, (
                        f"{page_name}/{theme}/{width}: horizontal overflow {geometry}"
                    )
                    if page_name == "popup":
                        labels = page.locator(".action-label")
                        assert labels.count() == 4, "Popup action labels missing"
                        expected_width = min(width, 376)
                        assert page.locator("html").evaluate(
                            "(node) => Math.round(node.getBoundingClientRect().width)"
                        ) == expected_width, "Popup document width is incorrect"
                        assert page.locator(".identity strong").evaluate(
                            "(node) => node.scrollWidth <= node.clientWidth + 2"
                        ), f"Popup header text overflows at {width}px"
                        if width >= 355:
                            for label in labels.all():
                                assert label.evaluate(
                                    "(node) => node.getBoundingClientRect().height <= 25"
                                ), f"Popup action label wraps at {width}px"
                    assert geometry["buttons"], f"{page_name}: no actual buttons"
                    for btn in geometry["buttons"]:
                        assert btn["width"] >= 25, f"{page_name}: narrow control {btn}"
                        assert btn["left"] >= -2 and btn["right"] <= width + 2, (
                            f"{page_name}/{theme}/{width}: clipped control {btn}"
                        )
                    expected_bg = "#151831" if theme == "dark" else "#f6f7f9"
                    assert geometry["bg"] == expected_bg, (
                        f"{page_name}/{theme}: expected {expected_bg}, got {geometry['bg']}"
                    )
                    page.screenshot(
                        path=str(OUT / f"{page_name}-{theme}-{width}px.png"),
                        full_page=True,
                    )
                    if page_name == "editor":
                        # Crop starts hidden. Once an area is selected, the
                        # Apply crop button becomes visible: verify this actual
                        # interaction state instead of exempting it forever.
                        page.evaluate("""() => {
                            document.getElementById("apply-crop").hidden = false;
                        }""")
                        crop = page.locator("#apply-crop").bounding_box()
                        assert crop and crop["width"] >= 25, (
                            f"{page_name}/{theme}/{width}: revealed crop button has no width"
                        )
                        assert crop["x"] >= -2 and crop["x"] + crop["width"] <= width + 2, (
                            f"{page_name}/{theme}/{width}: crop button clipped"
                        )
                        assert page.evaluate(
                            "() => document.documentElement.scrollWidth"
                        ) <= width + 2, (
                            f"{page_name}/{theme}/{width}: horizontal overflow after crop appears"
                        )
                        page.screenshot(
                            path=str(OUT / f"{page_name}-crop-{theme}-{width}px.png"),
                            full_page=True,
                        )
                    print(f"{page_name}/{theme}/{width}px: no horizontal overflow or clipped controls")
                    ctx.close()
        browser.close()


if __name__ == "__main__":
    run()
