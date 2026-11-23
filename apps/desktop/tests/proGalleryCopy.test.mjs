// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { proGalleryCopy } from "../src/lib/proGalleryCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";

test("Pro gallery selection/exports have complete translations", () => {
  assert.equal(LANGUAGES.length, 12);
  for (const { code } of LANGUAGES) {
    const copy = proGalleryCopy(code);
    for (const key of ["select","done","selectLoaded","clear","export","exporting","selected","failed","limit"]) {
      assert.ok(copy[key].trim(), code + " missing " + key);
    }
    assert.match(copy.count(3), /3 \/ 100/);
    assert.match(copy.exported(2), /2/);
  }
});
