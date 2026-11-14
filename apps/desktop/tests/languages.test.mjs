import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_STRINGS,
  LANGUAGES,
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
  for (const { code } of LANGUAGES) {
    assert.equal(normalizeLanguage(code), code);
    for (const source of CORE_STRINGS) {
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

test("Unreviewed strings fall back to clear English, never placeholders or keys", () => {
  for (const { code } of LANGUAGES) {
    assert.equal(translate(code, "Audio device not available"), "Audio device not available");
  }
  assert.equal(translate("en", "Settings"), "Settings");
});
