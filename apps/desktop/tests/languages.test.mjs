// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  ACTION_STRINGS,
  CORE_STRINGS,
  LANGUAGES,
  ALL_TRANSLATION_KEYS,
  hasTranslationKey,
  missingCoreTranslations,
  normalizeLanguage,
  translate,
} from "../src/lib/i18n.ts";

test("English is the stable default and exactly 12 unique locales are offered", () => {
  assert.equal(LANGUAGES.length, 12);
  assert.equal(LANGUAGES[0].code, "en");
  assert.equal(new Set(LANGUAGES.map(({ code }) => code)).size, LANGUAGES.length);
  assert.equal(normalizeLanguage(undefined), "en");
  assert.equal(normalizeLanguage(null), "en");
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("__proto__"), "en");
  assert.equal(normalizeLanguage("../../secret"), "en");
});

test("Every offered language has complete nonempty core control translations", () => {
  assert.deepEqual(missingCoreTranslations(), []);
  assert.ok(CORE_STRINGS.length >= 35);
  assert.ok(ACTION_STRINGS.length >= 35);
  for (const { code } of LANGUAGES) {
    assert.equal(normalizeLanguage(code), code);
    for (const source of [...CORE_STRINGS, ...ACTION_STRINGS]) {
      assert.ok(translate(code, source).trim(), `Missing ${code} translation for ${source}`);
    }
  }
});

test("User-critical settings and capture labels are actually translated", () => {
  for (const { code } of LANGUAGES.filter(({ code }) => code !== "en")) {
    for (const source of ["Settings", "Language", "Capture region", "Delete"]) {
      assert.notEqual(translate(code, source), source, `${code}: ${source}`);
    }
  }
});

test("gallery and recorder actions are translated in each non-English locale", () => {
  for (const { code } of LANGUAGES.filter(({ code }) => code !== "en")) {
    for (const key of ["Play recording", "Show in folder", "Stop and save", "Discard",
      "Delete screenshot?", "Could not stop recording. Try again."]) {
      assert.notEqual(translate(code, key), key, `${code}: ${key}`);
    }
  }
});

test("catalog has unique keys and complete translations for every selected language", () => {
  assert.ok(ALL_TRANSLATION_KEYS.length > 200);
  assert.equal(new Set(ALL_TRANSLATION_KEYS).size, ALL_TRANSLATION_KEYS.length,
    "Duplicate source keys make translations ambiguous");
  assert.deepEqual(missingCoreTranslations(), []);
  for (const { code } of LANGUAGES) {
    for (const source of ALL_TRANSLATION_KEYS) {
      assert.ok(translate(code, source).trim(), `Empty translation: ${code}: ${source}`);
      if (code !== "en") assert.ok(hasTranslationKey(source));
    }
  }
});

test("all statically named interface translations are present in the catalogs", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePaths = [
    "windows/Settings.tsx", "windows/Home.tsx", "windows/Overlay.tsx",
    "windows/Editor.tsx", "windows/RecBar.tsx", "windows/RecDraw.tsx",
    "windows/RecFrame.tsx", "components/Viewer.tsx",
    "components/WindowFrame.tsx", "components/AppErrorBoundary.tsx",
    "components/home/CaptureCard.tsx", "components/home/EmptyGallery.tsx",
    "components/viewer/VideoStage.tsx", "components/viewer/ImageStage.tsx",
    "components/viewer/StageError.tsx", "windows/settings/SettingsControls.tsx",
  ];
  const missing = [];
  for (const path of sourcePaths) {
    const code = readFileSync(resolve(here, "../src", path), "utf8");
    for (const found of code.matchAll(/\bt\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      if (!hasTranslationKey(found[1])) missing.push(`${path}: ${found[1]}`);
    }
  }
  assert.deepEqual(missing, [], `Missing translations: ${missing.join("; ")}`);
});

test("dynamic annotation, player and capture instructions also have translations", () => {
  const dynamic = [
    "Select", "Move / resize frame", "Replay", "Play", "Mute", "Unmute",
    "Paused", "Drag to select", "Drag to select the recording area",
    "for full screen", "to cancel", "Seek",
    "Choose the format and quality of your screenshots.",
    "Control video quality, audio sources and capture limits.",
    "Choose where captures are saved.",
    "Customize keyboard shortcuts for quick capture and recording.",
    "Make Snapvere feel right on your desktop.",
    "Review your privacy and storage controls.",
    "Version, product information, licensing and diagnostics.",
    "Try a different term.",
    "Use a shortcut or the button to take your first screenshot.",
  ];
  for (const source of dynamic) {
    assert.equal(hasTranslationKey(source), true, `Missing dynamic label: ${source}`);
  }
});

test("app TSX keeps visible labels and tooltips inside the localization layer", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePaths = [
    "windows/Settings.tsx", "windows/Home.tsx", "windows/Overlay.tsx",
    "windows/Editor.tsx", "windows/RecBar.tsx", "windows/RecDraw.tsx",
    "windows/RecFrame.tsx", "components/Viewer.tsx",
    "components/WindowFrame.tsx", "components/AppErrorBoundary.tsx",
    "components/home/CaptureCard.tsx", "components/home/EmptyGallery.tsx",
    "components/viewer/VideoStage.tsx", "components/viewer/ImageStage.tsx",
    "components/viewer/StageError.tsx", "windows/settings/SettingsControls.tsx",
  ];
  const hardcoded = [];
  const branding = new Set(["Snapvere", "Snapvere — Editor", "Settings", "SNAPVERE"]);
  const keyboardNames = new Set(["Enter", "Esc", "Fn", "PrintScreen"]);
  for (const path of sourcePaths) {
    const source = readFileSync(resolve(here, "../src", path), "utf8");
    // Attribute literals are visible on hover or to screen readers. The
    // WindowFrame title is an internal page discriminator, not a tooltip.
    for (const match of source.matchAll(/(?:aria-label|title|placeholder|hint)\s*=\s*"([^"]+)"/g)) {
      if (branding.has(match[1]) && source.slice(Math.max(0, match.index - 25), match.index).includes("WindowFrame")) continue;
      hardcoded.push(`${path}: attribute: ${match[1]}`);
    }
    // Avoid false positives from generic type declarations and keyboard glyphs.
    for (const match of source.matchAll(/>\s*([A-Za-zÀ-ž][^<>\n{}]*?)\s*</g)) {
      const label = match[1].trim();
      if (!label || branding.has(label) || keyboardNames.has(label) || label === "Promise") continue;
      hardcoded.push(`${path}: JSX text: ${label}`);
    }
  }
  assert.deepEqual(hardcoded, [], `Untranslated UI literals: ${hardcoded.join("; ")}`);
});

test("Unreviewed strings fall back to clear English, never placeholders or keys", () => {
  for (const { code } of LANGUAGES) {
    assert.equal(translate(code, "Audio device not available"), "Audio device not available");
  }
  assert.equal(translate("en", "Settings"), "Settings");
});
