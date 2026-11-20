import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../source/editor.js", import.meta.url), "utf8");

function openEditor() {
  const canvases = [];
  const controls = new Map();
  const makeControl = (id) => ({
    id, hidden: true, handlers: {}, textContent: "", value: "#a87aff",
    addEventListener(name, cb) { this.handlers[name] = cb; },
    setAttribute() {},
  });
  for (const id of ["status", "apply-crop", "color", "thickness",
    "undo", "reset", "save", "copy-desktop"]) controls.set(id, makeControl(id));
  const tools = ["pen", "rectangle", "text", "crop"].map((tool) =>
    ({ dataset: { tool }, setAttribute() {}, addEventListener(name, cb) {
      this[name] = cb;
    } }));
  function makeCanvas(display = false) {
    const calls = [];
    const context = {
      save() {}, restore() {}, clearRect() {}, drawImage() {},
      setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc() {}, fill() {}, stroke() {}, fillText() {},
      strokeRect(...args) { calls.push({ kind: "strokeRect", args }); },
    };
    const canvas = {
      width: 100, height: 100, handlers: {}, calls,
      getContext() { return context; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      addEventListener(name, cb) { this.handlers[name] = cb; },
      setPointerCapture() {}, hasPointerCapture() { return false; },
      releasePointerCapture() {},
      toDataURL() {
        if (display) throw new Error("Editor preview must not be exported");
        calls.push({ kind: "toDataURL" });
        return "data:image/png;base64,AQID";
      },
      toBlob(callback) {
        if (display) throw new Error("Editor preview must not be shared");
        calls.push({ kind: "toBlob" });
        callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
      },
    };
    canvases.push(canvas);
    return canvas;
  }
  const display = makeCanvas(true);
  const downloads = [];
  const clipboard = [];
  const root = {
    console, Blob, URLSearchParams,
    document: {
      getElementById(id) { return id === "editor-canvas" ? display : controls.get(id); },
      querySelectorAll() { return tools; },
      createElement(tag) { assert.equal(tag, "canvas"); return makeCanvas(); },
    },
    browser: { downloads: { async download(args) { downloads.push(args); return 1; } } },
    SnapvereWorkspace: {
      async loadDraft() { return { blob: new Blob([new Uint8Array([1])]), mode: "crop" }; },
    },
    location: { search: "?capture=abcdef" },
    navigator: { clipboard: { async write(items) { clipboard.push(items); } } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    URL: { createObjectURL() { return "blob:local"; }, revokeObjectURL() {} },
    Image: class {
      naturalWidth = 100; naturalHeight = 100;
      set src(value) { assert.equal(value, "blob:local"); queueMicrotask(() => this.onload?.()); }
    },
    window: { prompt() { return ""; } },
  };
  runInNewContext(source, root);
  return { canvases, controls, tools, display, downloads, clipboard };
}

test("crop guides render only on screen, never in a saved PNG or clipboard export", async () => {
  const editor = openEditor();
  await new Promise((resolve) => setImmediate(resolve));
  const { display, controls, canvases } = editor;
  assert.match(controls.get("status").textContent, /Loaded/);
  display.handlers.pointerdown({ clientX: 10, clientY: 12, button: 0, pointerId: 1 });
  display.handlers.pointermove({ clientX: 76, clientY: 85 });
  display.handlers.pointerup({ clientX: 76, clientY: 85, pointerId: 1 });
  assert.equal(controls.get("apply-crop").hidden, false);
  assert.ok(display.calls.some((x) => x.kind === "strokeRect"),
    "Crop outline is visible as an editor aid");

  await controls.get("save").handlers.click();
  assert.equal(editor.downloads.length, 1);
  assert.match(editor.downloads[0].filename, /^Snapvere\/Snapvere-/);
  assert.ok(editor.downloads[0].url.startsWith("data:image/png;base64,"));
  const savedCanvas = canvases.at(-1);
  assert.ok(savedCanvas.calls.some((x) => x.kind === "toDataURL"));
  assert.equal(savedCanvas.calls.filter((x) => x.kind === "strokeRect").length, 0,
    "Dashed crop selection must not be in the exported PNG");

  await controls.get("copy-desktop").handlers.click();
  assert.equal(editor.clipboard.length, 1);
  const copiedCanvas = canvases.at(-1);
  assert.ok(copiedCanvas.calls.some((x) => x.kind === "toBlob"));
  assert.equal(copiedCanvas.calls.filter((x) => x.kind === "strokeRect").length, 0,
    "Crop overlay must not be present in the Windows clipboard image");
});
