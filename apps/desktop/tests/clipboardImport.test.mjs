// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES } from "../src/lib/i18n.ts";
import { clipboardImportCopy } from "../src/lib/clipboardImportCopy.ts";

test("all supported desktop languages have nonempty import labels", () => {
  for (const { code } of LANGUAGES) {
    const copy = clipboardImportCopy(code);
    assert.ok(copy.action.length >= 8, code);
    assert.ok(copy.saved.length >= 12, code);
    assert.ok(copy.failed.length >= 20, code);
  }
});
test("Croatian clipboard copy describes an explicit PNG import", () => {
  const hr = clipboardImportCopy("hr");
  assert.match(hr.action, /međuspremnika/);
  assert.match(hr.saved, /galeriju/);
  assert.match(hr.failed, /PNG/);
});
