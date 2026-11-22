// Snapvere by Brendigo
// Analytics must never retain or replay behavior recorded before consent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(join(root, "site/analytics.js"), "utf8");

function makePage() {
  let ready;
  let consentBanner;
  const scripts = [];
  const choices = [];

  function element(tag) {
    return {
      tag,
      classList: { add() {}, remove() {} },
      dataset: {},
      children: [],
      append(...nodes) { this.children.push(...nodes); },
      appendChild(node) { this.children.push(node); },
      setAttribute() {},
      addEventListener(event, handler) { this["on" + event] = handler; },
    };
  }

  const document = {
    readyState: "loading",
    createElement: element,
    createTextNode: (value) => ({ textContent: value }),
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") ready = handler;
    },
    querySelectorAll: () => [],
    body: { appendChild(element) { consentBanner = element; } },
    head: { appendChild(element) { scripts.push(element); } },
  };

  const window = { SNAPVERE: { gaId: "G-TEST" } };
  const context = createContext({
    window,
    document,
    localStorage: {
      getItem: () => null,
      setItem(key, value) { choices.push([key, value]); },
    },
    location: { hostname: "snapvere.com" },
    requestAnimationFrame: (callback) => callback(),
    console,
  });
  runInContext(source, context, { filename: "site/analytics.js" });

  return {
    window, scripts, choices,
    showConsent() {
      assert.equal(typeof ready, "function");
      ready();
      assert.ok(consentBanner, "consent dialog must appear");
    },
    decide(value) {
      consentBanner.onclick({
        target: {
          closest: () => ({ getAttribute: () => value }),
        },
      });
    },
    eventNames() {
      // vm.Context arrays have a different realm/prototype; materialize in
      // the Node test realm before using deepStrictEqual.
      return Array.from(window.dataLayer).filter((args) => args[0] === "event").map((args) => args[1]);
    },
  };
}

test("analytics ignores pre-consent events even if consent is later accepted", () => {
  const page = makePage();
  page.window.snapvereTrack("before_consent", { private: "do-not-replay" });
  assert.deepEqual(page.eventNames(), []);
  assert.equal(page.scripts.length, 0);
  page.showConsent();
  page.decide("granted");
  assert.equal(page.scripts.length, 1);
  assert.deepEqual(page.eventNames(), [], "no buffered events may be replayed");
  page.window.snapvereTrack("after_consent");
  assert.deepEqual(page.eventNames(), ["after_consent"]);
  assert.deepEqual(page.choices, [["snapvere-consent", "granted"]]);
});

test("declining analytics never loads a tracking script or sends events", () => {
  const page = makePage();
  page.window.snapvereTrack("before_decline");
  page.showConsent();
  page.decide("denied");
  page.window.snapvereTrack("after_decline");
  assert.deepEqual(page.eventNames(), []);
  assert.equal(page.scripts.length, 0);
  assert.deepEqual(page.choices, [["snapvere-consent", "denied"]]);
});
