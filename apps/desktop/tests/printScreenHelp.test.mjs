// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES } from "../src/lib/i18n.ts";
import { printScreenCopy } from "../src/lib/printScreenHelp.ts";

test("every UI language explains Print Screen and startup behavior", () => {
  for (const { code } of LANGUAGES) {
    const text = printScreenCopy(code);
    assert.ok(text.enable.length > 4, code);
    assert.ok(text.active.length > 15, code);
    assert.ok(text.blocked.length > 35, code);
    assert.ok(text.startup.length > 35, code);
  }
});

test("Croatian UI clearly distinguishes resident tray and exited application", () => {
  const hr = printScreenCopy("hr");
  assert.match(hr.enable, /Print Screen/i);
  assert.match(hr.active, /odabir područja/);
  assert.match(hr.blocked, /Windows/);
  assert.match(hr.startup, /sistemskoj traci/);
  assert.match(hr.startup, /Potpuno zatvoren/);
});
