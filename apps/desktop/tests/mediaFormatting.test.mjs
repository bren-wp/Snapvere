// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { formatMediaDate, formatMediaSize } from "../src/lib/mediaFormatting.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";

test("all languages format gallery dates without crashing", () => {
  const timestamp = Date.UTC(2025, 4, 15, 12, 30);
  for (const { code } of LANGUAGES) {
    const formatted = formatMediaDate(timestamp, code);
    assert.ok(formatted.includes("2025"), `${code}: ${formatted}`);
    assert.equal(formatMediaDate(NaN, code), "—");
    assert.equal(formatMediaDate(Number.MAX_VALUE, code), "—");
  }
});

test("gallery sizes are localized and invalid metadata safely rejected", () => {
  assert.equal(formatMediaSize(0), "0 B");
  assert.equal(formatMediaSize(1024, "en"), "1 KB");
  assert.equal(formatMediaSize(1.5 * 1024 * 1024, "en"), "1.5 MB");
  assert.equal(formatMediaSize(1.5 * 1024 * 1024, "hr"), "1,5 MB");
  for (const input of [-1, NaN, Infinity]) assert.equal(formatMediaSize(input), "—");
});
