import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

test("picomatch build dependency is the reviewed patched fork", () => {
  const pkg = require("picomatch/package.json");
  assert.equal(pkg.name, "@ryotsu/picomatch");
  assert.equal(pkg.version, "4.0.7-a");
  assert.equal(pkg.license, "MIT");
});

test("patched picomatch matches ordinary files and rejects ReDoS patterns promptly", () => {
  const code = [
    "const assert = require('node:assert/strict');",
    "const pm = require('picomatch');",
    "assert.equal(pm.isMatch('gallery/shot.png', '**/*.png'), true);",
    "assert.equal(pm.isMatch('gallery/shot.jpg', '**/*.png'), false);",
    "assert.equal(pm.isMatch('src/main.tsx', 'src/*.tsx'), true);",
    "const cases = [",
    "  ['+(*a)', 'a'.repeat(80) + '!'],",
    "  ['*(*a)', 'a'.repeat(80) + '!'],",
    "  ['+(a*)', 'a'.repeat(80) + '/'],",
    "  ['+(*)b', 'a'.repeat(80) + '!'],",
    "  ['+(*a)c', 'a'.repeat(80) + '!'],",
    "  ['+(a*b)', 'ab'.repeat(40) + '!'],",
    "];",
    "for (const [glob, input] of cases) assert.equal(pm.isMatch(input, glob), false, glob);"
  ].join("\n");
  // Run in a child process. An unpatched catastrophic regex must never stall CI indefinitely.
  const result = spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8",
    timeout: 4000,
    windowsHide: true
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
