// Snapvere by Brendigo
// Lock down the public website's zero-telemetry policy.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("no analytics script or tracking consent button on any website page", () => {
  assert.equal(existsSync(join(root, "site/analytics.js")), false);
  for (const path of [
    "site/index.html", "site/download/index.html",
    "site/privacy/index.html", "site/license/index.html",
    "site/download/tauri/index.html",
  ]) {
    assert.doesNotMatch(read(path), /analytics\.js|data-consent-open|googletagmanager/i, path);
  }
});

test("download and FAQ interaction events are never tracked", () => {
  for (const path of ["site/app.js", "site/download.js", "site/config.js"]) {
    assert.doesNotMatch(read(path), /snapvereTrack|gtag\(|gaId|track\(|sendBeacon|dataLayer/i, path);
  }
});

test("website CSP disallows third-party networks and scripts", () => {
  for (const config of [read("site/_headers"), read("netlify.toml")]) {
    assert.match(config, /connect-src 'self';/);
    assert.match(config, /script-src 'self' 'sha256-/);
    assert.doesNotMatch(config, /googletagmanager|google-analytics|unsafe-eval|connect-src \*|script-src \*/i);
  }
});
