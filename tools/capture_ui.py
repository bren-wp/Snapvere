#!/usr/bin/env python3
"""Capture REAL React UI renders for README (with a stubbed IPC preview bridge)."""
from pathlib import Path
from base64 import b64encode
import json
from shutil import copyfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "screenshots"
OUTPUT.mkdir(parents=True, exist_ok=True)

TAURI_PREVIEW = r"""
(() => {
  let nextCallback = 1;
  const callbacks = new Map();
  const eventCallbacks = new Map();
  async function previewRgbaPacket() {
    const img = new Image();
    img.src = window.__SNAPVERE_PREVIEW_FRAME_URL;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const packet = new Uint8Array(8 + rgba.length);
    const hdr = new DataView(packet.buffer);
    hdr.setUint32(0, canvas.width, true);
    hdr.setUint32(4, canvas.height, true);
    packet.set(rgba, 8);
    return packet.buffer;
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "home" }, windows: [{ label: "home" }] },
    convertFileSrc(path) { return window.__SNAPVERE_EDITOR_IMAGE || "http://127.0.0.1:4173/screenshots/home.png"; },
    transformCallback(cb) { const id = nextCallback++; callbacks.set(id, cb); return id; },
    unregisterCallback(id) { callbacks.delete(id); },
    previewListenerReady() { return eventCallbacks.has("snapvere:capture"); },
    previewEmitCapture(payload) {
      const callback = callbacks.get(eventCallbacks.get("snapvere:capture"));
      if (!callback) throw new Error("Native screenshot event listener not registered");
      callback({ event: "snapvere:capture", id: 1, payload });
    },
    async invoke(command, args) {
      if (command === "plugin:event|listen") {
        eventCallbacks.set(args.event, args.handler);
        return 1;
      }
      if (command === "get_frozen_rgba") return previewRgbaPacket();
      if (command === "get_frozen_frame") return window.__SNAPVERE_PREVIEW_FRAME_URL;
      if (command === "plugin:window|scale_factor") return 1;
      if (command === "list_screenshots" || command === "search_screenshots" || command === "list_monitors") return [];
      if (command === "active_hotkeys") return ["PrintScreen", "Ctrl+Shift+R"];
      if (command === "plugin:autostart|is_enabled") return false;
      if (command.startsWith("plugin:event|")) return 1;
      if (command.startsWith("plugin:store|")) {
        if (command === "plugin:store|load" || command === "plugin:store|new") return 1;
        return null;
      }
      if (command === "stop_recording") {
        window.__SNAPVERE_TEST_STOP_ATTEMPTS = (window.__SNAPVERE_TEST_STOP_ATTEMPTS || 0) + 1;
        if (window.__SNAPVERE_TEST_STOP_ATTEMPTS === 1) throw new Error("Simulated native stop failure");
        return null;
      }
      if (command === "recording_status") return { state: "idle" };
      if (command === "plugin:window|is_visible") return true;
      return null;
    }
  };
})();
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--disable-web-security"])
    app = browser.new_context(viewport={"width": 1120, "height": 740},
                              device_scale_factor=1, color_scheme="dark")
    # Re-use an actual SNAPVERE screenshot as the editor's image fixture.
    editor_source = ROOT / "site/screenshots/home.png"
    assert editor_source.is_file(), "SNAPVERE editor preview fixture is missing"
    editor_uri = "data:image/png;base64," + b64encode(editor_source.read_bytes()).decode("ascii")
    app.add_init_script("window.__SNAPVERE_EDITOR_IMAGE = " + json.dumps(editor_uri))
    app.add_init_script(TAURI_PREVIEW)
    page = app.new_page()
    page.goto("http://127.0.0.1:1420/", wait_until="networkidle")
    page.get_by_role("banner").get_by_role("button", name="Capture region").wait_for(timeout=30000)
    capture_actions = page.get_by_role("group", name="Capture actions").get_by_role("button")
    assert capture_actions.count() == 3
    assert [capture_actions.nth(i).get_attribute("aria-label") for i in range(3)] == [
        "Capture region", "Record screen", "Full screen"
    ], "Web-aligned capture workflow/action order drifted"
    assert page.get_by_role("group", name="Filter gallery").get_by_role("button").count() == 3
    assert not page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2"), (
        "Desktop capture workspace overflows horizontally"
    )
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUTPUT / "home.png"), full_page=False)
    # Reproducible hover/focus captures; never assert these match native Windows
    # baselines just because the DOM state exists in headless Chromium.
    primary = page.get_by_role("group", name="Capture actions").get_by_role(
        "button", name="Capture region", exact=True
    )
    primary.hover()
    assert primary.evaluate("(el) => el.matches(':hover')"), "Home hover state did not activate"
    page.screenshot(path=str(OUTPUT / "home-hover.png"))
    primary.focus()
    assert primary.evaluate("(el) => document.activeElement === el"), "Home focus was lost"
    page.screenshot(path=str(OUTPUT / "home-focus.png"))
    settings = app.new_page()
    settings.goto("http://127.0.0.1:1420/#settings", wait_until="networkidle")
    settings.get_by_role("navigation").get_by_role("button", name="General").wait_for(timeout=30000)
    assert settings.get_by_role("navigation").get_by_role(
        "button", name="Capture settings", exact=True
    ).get_attribute("aria-current") == "page", "Capture should be the default settings page"
    settings.get_by_role("navigation").get_by_role("button", name="Capture settings").focus()
    settings.keyboard.press("ArrowDown")
    assert settings.get_by_role("navigation").get_by_role(
        "button", name="Recording settings", exact=True
    ).get_attribute("aria-current") == "page", "Keyboard sidebar navigation broke"
    settings.get_by_role("navigation").get_by_role("button", name="Capture settings").click()
    settings.wait_for_timeout(1500)
    settings.screenshot(path=str(OUTPUT / "settings.png"), full_page=False)
    for tab in ("Hotkeys", "Capture", "Recording", "Save", "Privacy", "About"):
        settings.get_by_role("navigation").get_by_role("button", name=tab + " settings", exact=True).click()
        settings.wait_for_timeout(200)
        settings.screenshot(path=str(OUTPUT / ("settings-" + tab.lower() + ".png")))
    # Changing Recording to GIF should actually disable microphone/system audio
    # rather than merely drawing grey-looking controls.
    settings.get_by_role("navigation").get_by_role("button", name="Recording settings", exact=True).click()
    settings.get_by_role("button", name="GIF", exact=True).click()
    assert settings.get_by_role("switch", name="Record microphone").is_disabled()
    assert settings.get_by_role("switch", name="Record system audio").is_disabled()
    settings.screenshot(path=str(OUTPUT / "settings-recording-gif-disabled.png"))
    settings.get_by_role("button", name="MP4", exact=True).click()
    settings.get_by_role("navigation").get_by_role("button", name="About settings", exact=True).click()
    expected_version = json.loads(
        (ROOT / "apps/desktop/package.json").read_text(encoding="utf-8")
    )["version"]
    settings.get_by_text(
        "Snapvere · Version " + expected_version, exact=True
    ).wait_for(timeout=20000)

    # Language selector must work across all 12 locales without clipping controls.
    settings.get_by_role("navigation").get_by_role("button", name="General settings").click()
    selector = settings.get_by_role("combobox")  # name changes when the locale changes
    assert selector.locator("option").count() == 12, "Expected 12 selectable languages"
    for language in ("hr", "de", "es", "fr", "it", "pt", "nl", "pl", "cs", "sk", "sl", "en"):
        selector.select_option(language)
        settings.wait_for_function(
            "(code) => document.documentElement.lang === code",
            arg=language,
            timeout=5000,
        )
        assert not settings.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2"), (
            f"Settings interface overflows for language {language}"
        )
    settings.screenshot(path=str(OUTPUT / "settings-languages.png"))

    # Theme is a shared product state, not just a Settings-page paint change.
    # Exercise the user-facing segmented control and verify an already-open Home
    # WebView updates as well, without a reload.
    settings.get_by_role("navigation").get_by_role(
        "button", name="General settings", exact=True
    ).click()
    settings.get_by_role("button", name="Light", exact=True).click()
    page.wait_for_function("() => document.documentElement.dataset.theme === 'light'",
                           timeout=10000)
    settings.screenshot(path=str(OUTPUT / "settings-theme-switched-light.png"))
    settings.get_by_role("button", name="Dark", exact=True).click()
    page.wait_for_function("() => document.documentElement.dataset.theme === 'dark'",
                           timeout=10000)

    # A failed native Stop must not hide the HUD or permanently disable its controls.
    hud = app.new_page()
    hud.goto("http://127.0.0.1:1420/#recbar", wait_until="networkidle")
    stop = hud.get_by_role("button", name="Stop and save", exact=True)
    stop.wait_for(timeout=30000)
    hud.get_by_role("button", name="Colour", exact=True).click()
    assert hud.locator('input[type="range"]').count() == 1, "Recording palette did not expand"
    hud.screenshot(path=str(OUTPUT / "recbar-palette.png"))
    hud.get_by_role("button", name="Colour", exact=True).click()
    stop.click()
    hud.get_by_role("alert").get_by_text("Could not stop recording. Try again.").wait_for(timeout=5000)
    hud.screenshot(path=str(OUTPUT / "recbar-stop-error.png"))
    assert stop.is_enabled(), "Recording HUD must remain usable after Stop IPC fails"
    stop.click()
    hud.wait_for_function("() => window.__SNAPVERE_TEST_STOP_ATTEMPTS === 2", timeout=5000)
    assert hud.get_by_role("alert").count() == 0, "Retry should clear the previous failure"
    hud.close()

    # The editor shows an existing, real React UI screenshot as its test image.
    # The preview transport is mocked: this is a UI render, not a native capture test.
    editor = app.new_page()
    editor_path = b64encode(b"Snapvere-frontend-preview.png").decode("ascii")
    editor.goto("http://127.0.0.1:1420/#editor?p=" + editor_path, wait_until="networkidle")
    editor.wait_for_function(
        "() => document.querySelector('canvas')?.width >= 900"
        " && !document.body.textContent.includes('could not be loaded')", timeout=20000
    )
    assert editor.get_by_role("group", name="Annotation tools").get_by_role("button").count() == 8
    assert editor.get_by_role("group", name="Annotation colors").get_by_role("button").count() == 7
    assert editor.get_by_role("button", name="Save image as a new file").is_enabled()
    assert not editor.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2"), (
        "Editor overflows horizontally"
    )
    editor.screenshot(path=str(OUTPUT / "editor.png"))
    # The same real React screens must also be exercised with light-mode tokens.
    # These are synthetic browser previews, not Windows/WebView2 acceptance.
    light = browser.new_context(viewport={"width": 1120, "height": 740},
                                device_scale_factor=1, color_scheme="light")
    light.add_init_script("try { localStorage.setItem('snapvere-theme', 'light'); } catch {}")
    light.add_init_script("window.__SNAPVERE_EDITOR_IMAGE = " + json.dumps(editor_uri))
    light.add_init_script(TAURI_PREVIEW)
    light_home = light.new_page()
    light_home.goto("http://127.0.0.1:1420/", wait_until="networkidle")
    light_home.get_by_role("group", name="Capture actions").get_by_role(
        "button", name="Capture region", exact=True
    ).wait_for(timeout=30000)
    light_home.wait_for_function("() => document.documentElement.dataset.theme === 'light'")
    style = light_home.evaluate("""() => ({
      border: getComputedStyle(document.documentElement).getPropertyValue('--brand-border').trim(),
      brandbar: getComputedStyle(document.querySelector('.snapvere-app-brandbar')).backgroundColor,
      primaryText: getComputedStyle(document.querySelector('.snapvere-action-card--primary')).color
    })""")
    assert style["border"] == "rgba(77, 66, 110, 0.2)", style
    assert style["brandbar"].startswith("rgba(255, 255, 255,"), style
    assert style["primaryText"] == "rgb(255, 255, 255)", style
    assert not light_home.evaluate("() => document.documentElement.scrollWidth > innerWidth + 2")
    light_home.screenshot(path=str(OUTPUT / "home-light.png"))
    light_home.get_by_role("group", name="Capture actions").get_by_role(
        "button", name="Capture region", exact=True
    ).hover()
    light_home.screenshot(path=str(OUTPUT / "home-hover-light.png"))

    light_settings = light.new_page()
    light_settings.goto("http://127.0.0.1:1420/#settings", wait_until="networkidle")
    light_settings.get_by_role("navigation").get_by_role(
        "button", name="Capture settings", exact=True
    ).wait_for(timeout=30000)
    for tab in ("Capture", "Recording", "Save", "Hotkeys", "General", "Privacy", "About"):
        light_settings.get_by_role("navigation").get_by_role(
            "button", name=tab + " settings", exact=True
        ).click()
        light_settings.wait_for_timeout(180)
        light_settings.screenshot(path=str(OUTPUT / ("settings-" + tab.lower() + "-light.png")))
        assert not light_settings.evaluate(
            "() => document.documentElement.scrollWidth > innerWidth + 2"
        ), f"Light Settings overflows in {tab}"
    light_settings.get_by_role("navigation").get_by_role(
        "button", name="General settings", exact=True
    ).click()
    # Native theme preference is stored via IPC; exercise the actual Settings control.
    light_settings.get_by_role("button", name="Light", exact=True).click()
    assert light_settings.evaluate("() => document.documentElement.dataset.theme") == "light"
    light_settings.screenshot(path=str(OUTPUT / "settings-light.png"))

    light_editor = light.new_page()
    light_editor.goto("http://127.0.0.1:1420/#editor?p=" + editor_path, wait_until="networkidle")
    light_editor.wait_for_function("() => document.querySelector('canvas')?.width >= 900",
                                   timeout=20000)
    light_editor.screenshot(path=str(OUTPUT / "editor-light.png"))
    light.close()
    app.close()
    compact = browser.new_context(viewport={"width": 920, "height": 650},
                                  device_scale_factor=1, color_scheme="dark")
    compact.add_init_script(TAURI_PREVIEW)
    compact_page = compact.new_page()
    compact_page.goto("http://127.0.0.1:1420/", wait_until="networkidle")
    compact_page.get_by_role("banner").get_by_role("button", name="Capture region").wait_for(timeout=30000)
    compact_page.screenshot(path=str(OUTPUT / "home-compact.png"))
    compact.close()
    site = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = site.new_page()
    page.goto("http://127.0.0.1:4173/", wait_until="networkidle")
    page.screenshot(path=str(OUTPUT / "website.png"), full_page=False)
    # Guard the new responsive split hero: marketing copy stays left of the
    # genuine product image at desktop widths, and both stay within the viewport.
    hero_title = page.locator(".hero__title").bounding_box()
    hero_preview = page.locator(".snapvere-hero-product").bounding_box()
    if not hero_title or not hero_preview or hero_title["x"] >= hero_preview["x"]:
        raise RuntimeError("SNAPVERE desktop hero no longer uses the intended split layout")
    if hero_preview["x"] + hero_preview["width"] > 1442:
        raise RuntimeError("SNAPVERE desktop hero image overflows the viewport")
    for address, filename in (("/download/", "download.png"), ("/privacy/", "privacy.png")):
        subpage = site.new_page()
        subpage.goto("http://127.0.0.1:4173" + address, wait_until="networkidle")
        subpage.screenshot(path=str(OUTPUT / filename))
    site.close()
    mobile_site = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    mobile_page = mobile_site.new_page()
    mobile_page.goto("http://127.0.0.1:4173/", wait_until="networkidle")
    mobile_page.screenshot(path=str(OUTPUT / "website-mobile.png"), full_page=False)
    # No horizontal overflow on narrow phones.
    horizontal_overflow = mobile_page.evaluate(
        "() => document.documentElement.scrollWidth > window.innerWidth + 2"
    )
    if horizontal_overflow:
        raise RuntimeError("SNAPVERE mobile homepage has horizontal overflow")
    for address, filename in (("/download/", "download-mobile.png"),
                              ("/privacy/", "privacy-mobile.png")):
        subpage = mobile_site.new_page()
        subpage.goto("http://127.0.0.1:4173" + address, wait_until="networkidle")
        subpage.screenshot(path=str(OUTPUT / filename))
    mobile_site.close()

    # Exercise the ACTUAL React screenshot overlay using a real website render
    # transported through the same in-memory RGBA wire format as the Rust IPC.
    # This verifies a visible, non-black frozen frame without pretending that
    # the preview harness can exercise native Windows display capture.
    preview_frame = "data:image/png;base64," + b64encode(
        (OUTPUT / "website.png").read_bytes()
    ).decode("ascii")
    selection = browser.new_context(
        viewport={"width": 1440, "height": 900}, device_scale_factor=1,
        color_scheme="dark"
    )
    selection.add_init_script(TAURI_PREVIEW)
    selection.add_init_script("window.__SNAPVERE_PREVIEW_FRAME_URL = " + json.dumps(preview_frame))
    capture_page = selection.new_page()
    capture_page.goto("http://127.0.0.1:1420/#overlay", wait_until="networkidle")
    capture_page.wait_for_function(
        "() => window.__TAURI_INTERNALS__?.previewListenerReady()",
        timeout=20000
    )
    capture_page.evaluate("""() => window.__TAURI_INTERNALS__.previewEmitCapture({
        token: Date.now(), id: 0, mode: "shot",
        x: 0, y: 0, width: 1440, height: 900
    })""")
    capture_page.wait_for_function(
        "() => document.querySelector('canvas')?.width === 1440",
        timeout=20000
    )
    capture_page.wait_for_timeout(400)
    lit_pixels = capture_page.evaluate("""() => {
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      let visible = 0;
      for (let y = 100; y < c.height; y += 125) {
        for (let x = 100; x < c.width; x += 125) {
          const p = ctx.getImageData(x, y, 1, 1).data;
          if (p[3] > 100 && (p[0] + p[1] + p[2]) > 95) visible++;
        }
      }
      return visible;
    }""")
    if lit_pixels < 8:
        raise RuntimeError("Capture overlay rendered black or empty pixels instead of the desktop")
    capture_page.screenshot(path=str(OUTPUT / "capture-overlay.png"))
    selection.close()
    browser.close()

for path in OUTPUT.glob("*.png"):
    if path.stat().st_size < 5000:
        raise RuntimeError(f"Screenshot output seems invalid: {path}")
    print(f"Screenshot: {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")

# Website preview cards must always show the same current React UI captures.
SITE_PREVIEWS = ROOT / "site" / "screenshots"
SITE_PREVIEWS.mkdir(parents=True, exist_ok=True)
for name in ("home.png", "settings.png", "editor.png"):
    copyfile(OUTPUT / name, SITE_PREVIEWS / name)
    print(f"Synced website preview: site/screenshots/{name}")
