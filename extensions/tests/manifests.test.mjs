import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const browsers = ["chrome", "edge", "brave", "opera", "vivaldi", "firefox", "safari"];
for (const name of browsers) {
  test(name + " is independently installable source with minimum permissions", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../" + name + "/manifest.json", import.meta.url), "utf8"));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, "0.1.0");
    assert.deepEqual(manifest.permissions, ["activeTab", "downloads"]);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.content_scripts, undefined);
    if (name === "firefox" || name === "safari") {
      assert.deepEqual(manifest.background.scripts, ["capture.js", "background.js"]);
    } else {
      assert.equal(manifest.background.service_worker, "background.js");
    }
    assert.equal(manifest.commands["capture-visible-tab"].suggested_key.default, "Ctrl+Shift+8");
    for (const filename of ["capture.js", "background.js", "popup.js", "popup.html", "popup.css"]) {
      const content = readFileSync(new URL("../../" + name + "/" + filename, import.meta.url), "utf8");
      assert.ok(content.length > 100);
      assert.doesNotMatch(content, /github\.com|github\.io/);
    }
  });
}
