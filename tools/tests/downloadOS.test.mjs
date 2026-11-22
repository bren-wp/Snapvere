// Snapvere by Brendigo
// Regression tests for user-supplied download query parameters.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { runInContext, createContext } from "node:vm";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "site/download.js"), "utf8");

// The browser listener is intentionally not fired: these tests exercise the
// pure URL parameter validation without triggering downloads or analytics.
function loadOSValidator() {
  const context = createContext({
    window: { SNAPVERE: { version: "0.2.4", downloads: {} } },
    document: { addEventListener() {} },
  });
  runInContext(script, context, { filename: "site/download.js" });
  return runInContext("supportedOS", context);
}

test("download OS query accepts only the two advertised targets", () => {
  const supportedOS = loadOSValidator();
  assert.equal(supportedOS("windows"), "windows");
  assert.equal(supportedOS("mac"), "mac");
  for (const value of [null, "", "linux", "Windows", "mobile", 1]) {
    assert.equal(supportedOS(value), null, String(value));
  }
});

test("prototype property names never become supported operating systems", () => {
  const supportedOS = loadOSValidator();
  for (const value of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(supportedOS(value), null, value);
  }
});
