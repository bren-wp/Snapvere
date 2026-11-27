// Snapvere by Brendigo
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const source = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("WinUI and Tauri distribution channels do not cross-install", () => {
  const winui = source("site/download/index.html");
  const tauri = source("site/download/tauri/index.html");
  const frontend = source("apps/desktop/src/lib/updateFeed.ts");
  const generator = source("tools/generate_update_manifest.py");
  const example = source("deploy/update.snapvere.com/stable.example.json");
  assert.ok(source("site/config.js").includes('version: "0.2.4"'));
  assert.ok(winui.includes("WinUI/.NET edition"));
  assert.ok(winui.includes("/download/tauri/"));
  assert.ok(tauri.includes("Tauri/Rust edition"));
  assert.ok(tauri.includes("https://github.com/bren-wp/Snapvere/releases"));
  assert.ok(!tauri.includes("/files/Snapvere-"));
  assert.ok(tauri.includes("Snapvere-Linux-amd64.deb"));
  assert.ok(tauri.includes("Snapvere-Linux-x86_64.AppImage"));
  assert.ok(tauri.includes("may not exist in older releases"));
  assert.ok(frontend.includes('https://snapvere.com/download/tauri/'));
  assert.ok(!frontend.includes('https://snapvere.com/download/"'));
  assert.ok(generator.includes('https://snapvere.com/download/tauri/'));
  const catalog = JSON.parse(example);
  assert.equal(catalog.product, "snapvere-installed-delta-v1");
  assert.equal(catalog.channel, "stable");
  assert.deepEqual(catalog.packages, []);
  assert.equal(catalog.download_url, undefined);
});
